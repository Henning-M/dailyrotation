import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDb, migrate, type Db } from '../src/server/db/index.js';
import { Repo } from '../src/server/repo.js';
import { DailyService } from '../src/server/service.js';
import { createApp } from '../src/server/app.js';
import type { Source } from '../src/server/sources/types.js';
import type { RankingCandidate } from '../src/shared/types.js';
import { seeded } from './helpers.js';

const ranking = (id: string, n = 12): RankingCandidate => ({
  id,
  title: `Secret title ${id}`,
  source: 'Fake',
  entries: Array.from({ length: n }, (_, i) => ({ rank: i + 1, label: `${id}-${i + 1}`, value: `${100 - i}` })),
});

/** A source that hands out its rankings in order, skipping excluded ones. */
function fakeSource(id: string, rankings: RankingCandidate[]): Source {
  return {
    id,
    name: `Fake ${id}`,
    weight: 1,
    async generate(ctx) {
      return rankings.find((r) => !ctx.excludeIds.has(r.id) && r.entries.length >= ctx.minEntries) ?? null;
    },
  };
}

const failing: Source = {
  id: 'broken',
  name: 'Broken',
  weight: 1,
  async generate() {
    throw new Error('boom');
  },
};

describe('DailyService', () => {
  let db: Db;
  let service: DailyService;
  let now: Date;

  beforeEach(async () => {
    db = await createDb({ inMemory: true });
    await migrate(db);
    now = new Date('2026-11-23T08:30:00Z'); // Monday
    const sources = [
      fakeSource('a', [ranking('a1'), ranking('a2'), ranking('a3'), ranking('a-short', 3)]),
      fakeSource('b', [ranking('b1'), ranking('b2')]),
      failing,
    ];
    service = new DailyService(new Repo(db), sources, seeded(1), () => now);
  });
  afterEach(() => db.close());

  async function team() {
    for (const [name, group] of [
      ['Anna', 'FE'],
      ['Ben', 'fe'],
      ['Cem', 'BE'],
      ['Dora', 'BE'],
      ['Lead', null],
    ] as const) {
      await service.addMember(name, group);
    }
    return (await service.moderatorState()).members;
  }

  async function fullDaily() {
    const s = await service.loadSlot(0);
    const id = s.slots[0].candidate!.id;
    await service.select(id);
    await service.draw();
    await service.reveal();
    await service.newDaily();
    return id;
  }

  it('runs a whole daily and hides the title from the show view until the reveal', async () => {
    const members = await team();
    expect(members.map((m) => m.group)).toEqual(['FE', 'FE', 'BE', 'BE', null]); // normalised

    let s = await service.loadSlot(0);
    s = await service.loadSlot(1);
    expect(s.slots[0].status).toBe('ready');
    expect(s.slots[1].status).toBe('ready');
    expect(s.slots[0].sourceId).not.toBe(s.slots[1].sourceId); // mixed sources

    const chosen = s.slots[1].candidate!;
    await service.select(chosen.id);

    let show = await service.showState();
    expect(show.phase).toBe('idle');

    s = await service.draw();
    expect(s.assignment!.map((a) => a.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(s.drawInfo!.weights.every((w) => w.weight === 5)).toBe(true);

    show = await service.showState();
    expect(show.phase).toBe('drawn');
    expect(show.reveal).toBeUndefined();
    expect(JSON.stringify(show)).not.toContain('Secret title');
    expect(show.rows.every((r) => r.value === undefined)).toBe(true);
    expect(show.rows[0].status).toBe('current');

    await service.step(1);
    show = await service.showState();
    expect(show.rows.map((r) => r.status)).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming']);

    await service.reveal();
    show = await service.showState();
    expect(show.phase).toBe('revealed');
    expect(show.reveal!.title).toBe(chosen.title);
    expect(show.rows[0].value).toBeDefined();

    const state = await service.moderatorState();
    expect(state.runsThisWeek).toHaveLength(1);
    expect(state.runsThisWeek[0].rankingId).toBe(chosen.id);
    expect(state.runsThisWeek[0].dailyDate).toBe('2026-11-23');
    expect(state.usedRankingCount).toBe(1);

    // a second reveal does not save twice
    await service.reveal();
    expect((await service.moderatorState()).runsThisWeek).toHaveLength(1);
  });

  it('never suggests a used ranking again, also after the weekly pruning', async () => {
    await team();
    const used = new Set<string>();
    used.add(await fullDaily());
    now = new Date('2026-11-24T08:30:00Z');
    used.add(await fullDaily());

    now = new Date('2026-12-01T08:30:00Z'); // next week: runs are pruned
    const state = await service.moderatorState();
    expect(state.runsThisWeek).toHaveLength(0);
    expect(state.usedRankingCount).toBe(2);

    for (let slot = 0; slot < 3; slot++) {
      const s = await service.loadSlot(slot);
      const c = s.slots[slot].candidate;
      if (c) expect(used.has(c.id)).toBe(false);
    }
  });

  it('lowers the weight for #1 of people who started recently', async () => {
    const members = await team();
    await fullDaily();
    const first = (await service.moderatorState()).runsThisWeek[0].firstMemberId;
    now = new Date('2026-11-24T08:30:00Z');
    await service.loadSlot(0);
    const s0 = await service.moderatorState();
    await service.select(s0.session.slots[0].candidate!.id);
    const s = await service.draw();
    const w = new Map(s.drawInfo!.weights.map((x) => [x.memberId, x.weight]));
    expect(w.get(first)).toBe(1);
    for (const m of members) if (m.id !== first) expect(w.get(m.id)).toBe(5);
  });

  it('rerolling a slot gives a different ranking; failing sources fall back to others', async () => {
    await team();
    const ids = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const s = await service.loadSlot(0);
      expect(s.slots[0].status).toBe('ready');
      const id = s.slots[0].candidate!.id;
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
  });

  it('reports an error in the slot when nothing is left', async () => {
    await team();
    const results = [];
    for (let slot = 0; slot < 4; slot++) results.push((await service.loadSlot(slot)).slots[slot]);
    // 5 rankings with >= 10 entries exist; 4 slots fit, so all are ready
    expect(results.every((r) => r.status === 'ready')).toBe(true);
    const s = await service.loadSlot(0); // reroll: one left
    expect(s.slots[0].status).toBe('ready');
    const s2 = await service.loadSlot(0); // none left
    expect(s2.slots[0].status).toBe('error');
    expect(s2.slots[0].error).toMatch(/No suggestion available/);
  });

  it('attendance changes reset an unrevealed draw and absent people are not drawn', async () => {
    const members = await team();
    const s = await service.loadSlot(0);
    await service.select(s.slots[0].candidate!.id);
    await service.draw();
    const after = await service.setPresent(members[4].id, false);
    expect(after.assignment).toBeNull();
    const drawn = await service.draw();
    expect(drawn.assignment).toHaveLength(4);
    expect(drawn.assignment!.some((a) => a.memberId === members[4].id)).toBe(false);
  });

  it('archived members are not present, restored members are', async () => {
    const members = await team();
    await service.updateMember(members[0].id, { active: false });
    let st = await service.moderatorState();
    expect(st.session.attendance).not.toContain(members[0].id);
    await service.updateMember(members[0].id, { active: true });
    st = await service.moderatorState();
    expect(st.session.attendance).toContain(members[0].id);
  });

  it('deleting a run frees its ranking and removes it from the fairness history', async () => {
    await team();
    const id = await fullDaily();
    const st = await service.moderatorState();
    await service.deleteRun(st.runsThisWeek[0].id);
    const after = await service.moderatorState();
    expect(after.runsThisWeek).toHaveLength(0);
    expect(after.usedRankingCount).toBe(0);
    expect(id).toBeTruthy();
  });

  it('exposes the flow over HTTP and rejects invalid actions with 400', async () => {
    const app = createApp(service);
    await request(app).post('/api/members').send({ name: 'Anna', group: 'FE' }).expect(200);
    await request(app).post('/api/members').send({ name: '  ' }).expect(400);
    await request(app).post('/api/session/draw').expect(400);
    const st = await request(app).get('/api/state').expect(200);
    expect(st.body.members).toHaveLength(1);
    expect(st.headers['cache-control']).toBe('no-store');
    const show = await request(app).get('/api/show').expect(200);
    expect(show.body.phase).toBe('idle');
    await request(app).get('/api/nope').expect(404);
  });
});
