// All SQL lives here.

import type { Db } from './db/index.js';
import type { Assignment, Member, Run, Session } from '../shared/types.js';

interface MemberRow {
  id: number;
  name: string;
  team_group: string | null;
  active: boolean;
}
const toMember = (r: MemberRow): Member => ({ id: r.id, name: r.name, group: r.team_group, active: r.active });

interface RunRow {
  id: number;
  created_at: Date | string;
  daily_date: string;
  ranking_id: string;
  title: string;
  source: string;
  assignment: Assignment[];
  first_member_id: number;
  first_member_name: string;
}
const toRun = (r: RunRow): Run => ({
  id: r.id,
  createdAt: new Date(r.created_at).toISOString(),
  dailyDate: r.daily_date,
  rankingId: r.ranking_id,
  title: r.title,
  source: r.source,
  assignment: r.assignment,
  firstMemberId: r.first_member_id,
  firstMemberName: r.first_member_name,
});

export class Repo {
  constructor(private db: Db) {}

  // --- members -------------------------------------------------------------
  async listMembers(): Promise<Member[]> {
    const rows = await this.db.query<MemberRow>('SELECT * FROM members ORDER BY lower(name), id');
    return rows.map(toMember);
  }

  async addMember(name: string, group: string | null): Promise<Member> {
    const [row] = await this.db.query<MemberRow>(
      'INSERT INTO members (name, team_group) VALUES ($1, $2) RETURNING *',
      [name, group],
    );
    return toMember(row);
  }

  async updateMember(id: number, patch: { name?: string; group?: string | null; active?: boolean }): Promise<Member | null> {
    const [row] = await this.db.query<MemberRow>(
      `UPDATE members SET
         name = COALESCE($2, name),
         team_group = CASE WHEN $3::boolean THEN $4 ELSE team_group END,
         active = COALESCE($5, active)
       WHERE id = $1 RETURNING *`,
      [id, patch.name ?? null, patch.group !== undefined, patch.group ?? null, patch.active ?? null],
    );
    return row ? toMember(row) : null;
  }

  async deleteMember(id: number): Promise<void> {
    await this.db.query('DELETE FROM members WHERE id = $1', [id]);
  }

  // --- runs ----------------------------------------------------------------
  async runsOfWeek(weekStart: string): Promise<Run[]> {
    const rows = await this.db.query<RunRow>(
      'SELECT * FROM runs WHERE week_start = $1 ORDER BY created_at DESC, id DESC',
      [weekStart],
    );
    return rows.map(toRun);
  }

  /** Deletes runs from previous weeks. used_rankings keep their entry (run_id becomes NULL). */
  async pruneRunsBefore(weekStart: string): Promise<void> {
    await this.db.query('DELETE FROM runs WHERE week_start < $1', [weekStart]);
  }

  async saveRun(run: {
    dailyDate: string;
    weekStart: string;
    rankingId: string;
    title: string;
    source: string;
    assignment: Assignment[];
  }): Promise<number> {
    const first = run.assignment[0];
    const [row] = await this.db.query<{ id: number }>(
      `INSERT INTO runs (daily_date, week_start, ranking_id, title, source, assignment, first_member_id, first_member_name)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8) RETURNING id`,
      [run.dailyDate, run.weekStart, run.rankingId, run.title, run.source, JSON.stringify(run.assignment), first.memberId, first.memberName],
    );
    await this.db.query(
      `INSERT INTO used_rankings (ranking_id, title, run_id) VALUES ($1, $2, $3)
       ON CONFLICT (ranking_id) DO UPDATE SET run_id = EXCLUDED.run_id, used_at = now()`,
      [run.rankingId, run.title, row.id],
    );
    return row.id;
  }

  /** Deletes a run (e.g. a test run) and frees its ranking again. */
  async deleteRun(id: number): Promise<void> {
    await this.db.query('DELETE FROM used_rankings WHERE run_id = $1', [id]);
    await this.db.query('DELETE FROM runs WHERE id = $1', [id]);
  }

  // --- used rankings -------------------------------------------------------
  async usedRankingIds(): Promise<Set<string>> {
    const rows = await this.db.query<{ ranking_id: string }>('SELECT ranking_id FROM used_rankings');
    return new Set(rows.map((r) => r.ranking_id));
  }

  // --- session -------------------------------------------------------------
  async loadSession(): Promise<Session | null> {
    const [row] = await this.db.query<{ value: Session }>("SELECT value FROM app_state WHERE key = 'session'");
    return row?.value ?? null;
  }

  async saveSession(session: Session): Promise<void> {
    await this.db.query(
      `INSERT INTO app_state (key, value, updated_at) VALUES ('session', $1::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(session)],
    );
  }

  // --- API cache -----------------------------------------------------------
  async cacheGet(key: string, maxAgeMs: number): Promise<unknown | undefined> {
    const [row] = await this.db.query<{ payload: unknown; fetched_at: Date | string }>(
      'SELECT payload, fetched_at FROM api_cache WHERE key = $1',
      [key],
    );
    if (!row) return undefined;
    if (Date.now() - new Date(row.fetched_at).getTime() > maxAgeMs) return undefined;
    return row.payload;
  }

  async cachePut(key: string, payload: unknown): Promise<void> {
    await this.db.query(
      `INSERT INTO api_cache (key, payload, fetched_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()`,
      [key, JSON.stringify(payload)],
    );
  }
}
