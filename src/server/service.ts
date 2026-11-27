// Application logic: team, session flow (suggest -> select -> draw -> speak -> reveal) and history.
// Runs in a single Cloud Run instance; session updates are serialised with an in-process lock.

import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { assign, drawOrder, type Rng } from './draw.js';
import { startWeights } from './fairness.js';
import { createFetchJson } from './http.js';
import type { Repo } from './repo.js';
import { sourceOrder, suggest } from './suggestions.js';
import type { Source } from './sources/types.js';
import { localDate, weekStart } from './week.js';
import type { Member, ModeratorState, Session, ShowState, SuggestionSlot } from '../shared/types.js';

export class UserError extends Error {}

const emptySlots = (): SuggestionSlot[] =>
  Array.from({ length: config.suggestionSlots }, (_, slot) => ({ slot, status: 'empty' as const }));

export class DailyService {
  private lock: Promise<unknown> = Promise.resolve();
  private fetchJson;

  constructor(
    private repo: Repo,
    private sources: Source[],
    private rng: Rng = Math.random,
    private now: () => Date = () => new Date(),
  ) {
    this.fetchJson = createFetchJson(repo);
  }

  /** Runs fn exclusively (read-modify-write of the session). */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async session(): Promise<Session> {
    const s = await this.repo.loadSession();
    if (s) return s;
    const members = await this.repo.listMembers();
    return this.freshSession(members);
  }

  private freshSession(members: Member[]): Session {
    return {
      attendance: members.filter((m) => m.active).map((m) => m.id),
      slots: emptySlots(),
      discardedIds: [],
      selectedId: null,
      selected: null,
      assignment: null,
      drawInfo: null,
      currentIndex: -1,
      revealed: false,
      runId: null,
    };
  }

  private update(fn: (s: Session, members: Member[]) => void | Promise<void>): Promise<Session> {
    return this.exclusive(async () => {
      const s = await this.session();
      const members = await this.repo.listMembers();
      await fn(s, members);
      await this.repo.saveSession(s);
      return s;
    });
  }

  private currentWeek(): string {
    return weekStart(this.now(), config.timeZone);
  }

  // --- read models ----------------------------------------------------------
  async moderatorState(): Promise<ModeratorState> {
    const week = this.currentWeek();
    await this.repo.pruneRunsBefore(week);
    const [members, session, runsThisWeek, used] = await Promise.all([
      this.repo.listMembers(),
      this.session(),
      this.repo.runsOfWeek(week),
      this.repo.usedRankingIds(),
    ]);
    return {
      members,
      session,
      runsThisWeek,
      usedRankingCount: used.size,
      sources: this.sources.map((s) => ({ id: s.id, name: s.name })),
    };
  }

  async showState(): Promise<ShowState> {
    const s = await this.session();
    if (!s.assignment) return { phase: 'idle', rows: [] };
    const rows = s.assignment.map((a, i) => ({
      rank: a.rank,
      label: a.label,
      memberName: a.memberName,
      status: (i < s.currentIndex ? 'done' : i === s.currentIndex ? 'current' : 'upcoming') as 'done' | 'current' | 'upcoming',
      // values and title are only sent after the reveal
      ...(s.revealed && a.value ? { value: a.value } : {}),
    }));
    if (!s.revealed || !s.selected) return { phase: 'drawn', rows };
    return { phase: 'revealed', rows, reveal: { title: s.selected.title, source: s.selected.source } };
  }

  // --- team -----------------------------------------------------------------
  async addMember(name: string, group: string | null): Promise<Member> {
    const clean = name.trim();
    if (!clean) throw new UserError('Name must not be empty');
    const member = await this.repo.addMember(clean, normaliseGroup(group));
    await this.update((s) => {
      if (!s.attendance.includes(member.id)) s.attendance.push(member.id);
      this.invalidateDraw(s);
    });
    return member;
  }

  async updateMember(id: number, patch: { name?: string; group?: string | null; active?: boolean }): Promise<Member> {
    if (patch.name !== undefined && !patch.name.trim()) throw new UserError('Name must not be empty');
    const member = await this.repo.updateMember(id, {
      ...patch,
      name: patch.name?.trim(),
      group: patch.group === undefined ? undefined : normaliseGroup(patch.group),
    });
    if (!member) throw new UserError('Member not found');
    if (patch.active !== undefined || patch.group !== undefined) {
      await this.update((s) => {
        if (patch.active === false) s.attendance = s.attendance.filter((x) => x !== id);
        if (patch.active === true && !s.attendance.includes(id)) s.attendance.push(id);
        this.invalidateDraw(s);
      });
    }
    return member;
  }

  async deleteMember(id: number): Promise<void> {
    await this.repo.deleteMember(id);
    await this.update((s) => {
      s.attendance = s.attendance.filter((x) => x !== id);
      this.invalidateDraw(s);
    });
  }

  // --- session --------------------------------------------------------------
  async setPresent(memberId: number, present: boolean): Promise<Session> {
    return this.update((s, members) => {
      const m = members.find((x) => x.id === memberId && x.active);
      if (!m) throw new UserError('Member not found');
      s.attendance = s.attendance.filter((x) => x !== memberId);
      if (present) s.attendance.push(memberId);
      this.invalidateDraw(s);
    });
  }

  /** A changed team invalidates a draw that has not been revealed yet. */
  private invalidateDraw(s: Session) {
    if (s.revealed) return;
    s.assignment = null;
    s.drawInfo = null;
    s.currentIndex = -1;
  }

  private minEntries(s: Session): number {
    return Math.max(config.minEntries, s.attendance.length);
  }

  /** (Re)loads one suggestion slot. The slot shows "loading" while the source is queried (can take ~30 s). */
  async loadSlot(slot: number): Promise<Session> {
    if (!Number.isInteger(slot) || slot < 0 || slot >= config.suggestionSlots) throw new UserError('Invalid slot');
    const token = randomUUID();
    let excludeIds = new Set<string>();
    let order: Source[] = [];
    let minEntries = config.minEntries;
    await this.update(async (s) => {
      if (s.revealed) throw new UserError('This daily is already revealed – start a new daily first');
      if (s.slots.length !== config.suggestionSlots) s.slots = emptySlots();
      const others = s.slots.filter((x) => x.slot !== slot);
      s.discardedIds ??= [];
      const old = s.slots[slot];
      if (old?.candidate && !s.discardedIds.includes(old.candidate.id)) s.discardedIds.push(old.candidate.id);
      excludeIds = await this.repo.usedRankingIds();
      for (const id of s.discardedIds) excludeIds.add(id);
      for (const x of s.slots) if (x.candidate) excludeIds.add(x.candidate.id);
      if (s.selectedId) excludeIds.add(s.selectedId);
      // decide the source now (also for slots loading in parallel), so the suggestions are mixed
      const avoid = new Set(others.map((x) => x.sourceId).filter((x): x is string => !!x));
      order = sourceOrder(this.sources, avoid, this.rng);
      minEntries = this.minEntries(s);
      if (old?.candidate && old.candidate.id === s.selectedId) {
        s.selectedId = null;
        s.selected = null;
        this.invalidateDraw(s);
      }
      s.slots[slot] = { slot, status: 'loading', token, sourceId: order[0]?.id };
    });

    let result: SuggestionSlot;
    try {
      const { candidate, sourceId } = await suggest(order, {
        rng: this.rng,
        minEntries,
        excludeIds,
        fetchJson: this.fetchJson,
      });
      result = { slot, status: 'ready', token, sourceId, candidate };
    } catch (err) {
      result = { slot, status: 'error', token, error: err instanceof Error ? err.message : String(err) };
    }

    return this.update((s) => {
      // drop late results if the slot has been reloaded meanwhile
      if (s.slots[slot]?.token !== token) return;
      // another slot may have got the same ranking in parallel
      if (result.candidate && s.slots.some((x) => x.slot !== slot && x.candidate?.id === result.candidate!.id)) {
        result = { slot, status: 'error', token, error: 'Duplicate suggestion – please reroll' };
      }
      s.slots[slot] = result;
    });
  }

  async clearSlots(): Promise<Session> {
    return this.update((s) => {
      if (s.revealed) throw new UserError('This daily is already revealed – start a new daily first');
      s.slots = emptySlots();
      s.selectedId = null;
      s.selected = null;
      this.invalidateDraw(s);
    });
  }

  async select(candidateId: string): Promise<Session> {
    return this.update((s) => {
      if (s.revealed) throw new UserError('This daily is already revealed – start a new daily first');
      const c = s.slots.find((x) => x.candidate?.id === candidateId)?.candidate;
      if (!c) throw new UserError('Suggestion not found');
      s.selectedId = c.id;
      s.selected = c;
      this.invalidateDraw(s);
    });
  }

  async draw(): Promise<Session> {
    const runs = await this.repo.runsOfWeek(this.currentWeek());
    return this.update((s, members) => {
      if (s.revealed) throw new UserError('This daily is already revealed – start a new daily first');
      if (!s.selected) throw new UserError('Select a ranking first');
      const present = members.filter((m) => m.active && s.attendance.includes(m.id));
      if (present.length === 0) throw new UserError('Nobody is present');
      if (s.selected.entries.length < present.length) {
        throw new UserError(`The selected ranking has only ${s.selected.entries.length} entries for ${present.length} people`);
      }
      const weights = startWeights(present.map((m) => m.id), runs, config.fairnessMaxWeight);
      const order = drawOrder(present, (p) => weights.get(p.id)!, this.rng);
      const entries = [...s.selected.entries].sort((a, b) => a.rank - b.rank);
      s.assignment = assign(order, entries);
      s.drawInfo = { weights: present.map((m) => ({ memberId: m.id, memberName: m.name, weight: weights.get(m.id)! })) };
      s.currentIndex = 0;
    });
  }

  async setSpeaker(index: number): Promise<Session> {
    return this.update((s) => {
      if (!s.assignment) throw new UserError('Draw first');
      s.currentIndex = Math.max(0, Math.min(index, s.assignment.length)); // length = everybody done
    });
  }

  async step(delta: 1 | -1): Promise<Session> {
    return this.update((s) => {
      if (!s.assignment) throw new UserError('Draw first');
      s.currentIndex = Math.max(0, Math.min(s.currentIndex + delta, s.assignment.length));
    });
  }

  /** Reveals the ranking and saves the run (once). */
  async reveal(): Promise<Session> {
    return this.update(async (s) => {
      if (!s.assignment || !s.selected) throw new UserError('Draw first');
      if (s.revealed) return;
      const now = this.now();
      s.runId = await this.repo.saveRun({
        dailyDate: localDate(now, config.timeZone),
        weekStart: weekStart(now, config.timeZone),
        rankingId: s.selected.id,
        title: s.selected.title,
        source: s.selected.source,
        assignment: s.assignment,
      });
      s.revealed = true;
    });
  }

  async newDaily(): Promise<Session> {
    return this.update((s, members) => {
      Object.assign(s, this.freshSession(members));
    });
  }

  async deleteRun(id: number): Promise<void> {
    await this.repo.deleteRun(id);
    await this.update((s) => {
      if (s.runId === id) s.runId = null;
    });
  }
}

function normaliseGroup(group: string | null | undefined): string | null {
  const g = group?.trim();
  return g ? g.toUpperCase() : null;
}
