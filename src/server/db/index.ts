// Thin database layer: real Postgres via `pg` in production, embedded Postgres (PGlite) locally and in tests.

import { config } from '../config.js';
import { migrations } from './migrations.js';

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs SQL that may contain several statements (no parameters). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  kind: 'pg' | 'pglite';
}

export async function createDb(opts: { inMemory?: boolean } = {}): Promise<Db> {
  if (!opts.inMemory && (config.databaseUrl || config.db.host)) {
    const { default: pg } = await import('pg');
    const pool = config.databaseUrl
      ? new pg.Pool({ connectionString: config.databaseUrl, max: 5 })
      : new pg.Pool({ ...config.db, max: 5 });
    return {
      kind: 'pg',
      async query(sql, params) {
        const res = await pool.query(sql, params as unknown[]);
        return res.rows;
      },
      async exec(sql) {
        await pool.query(sql);
      },
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const lite = opts.inMemory ? new PGlite() : new PGlite(config.pgliteDir);
  return {
    kind: 'pglite',
    async query(sql, params) {
      const res = await lite.query(sql, params as unknown[]);
      return res.rows as never[];
    },
    async exec(sql) {
      await lite.exec(sql);
    },
    close: () => lite.close(),
  };
}

export async function migrate(db: Db): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version integer PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const done = new Set((await db.query<{ version: number }>('SELECT version FROM schema_migrations')).map((r) => r.version));
  for (const m of migrations) {
    if (done.has(m.version)) continue;
    await db.exec(`BEGIN;\n${m.sql}\nINSERT INTO schema_migrations (version) VALUES (${m.version});\nCOMMIT;`);
  }
}
