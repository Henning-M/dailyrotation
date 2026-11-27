// Versioned schema migrations. Each runs exactly once (tracked in schema_migrations).
// Add new ones at the end; never edit a migration that has already been deployed.

export const migrations: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE members (
        id serial PRIMARY KEY,
        name text NOT NULL,
        team_group text,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      -- One row per finished daily (saved on "Reveal"). Only the current week is kept.
      CREATE TABLE runs (
        id serial PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        daily_date text NOT NULL,   -- YYYY-MM-DD in the team time zone
        week_start text NOT NULL,   -- Monday of that week, YYYY-MM-DD
        ranking_id text NOT NULL,
        title text NOT NULL,
        source text NOT NULL,
        assignment jsonb NOT NULL,
        first_member_id integer NOT NULL,
        first_member_name text NOT NULL
      );

      -- Rankings that have been used. Kept forever (survives the weekly pruning of runs).
      CREATE TABLE used_rankings (
        ranking_id text PRIMARY KEY,
        title text NOT NULL,
        used_at timestamptz NOT NULL DEFAULT now(),
        run_id integer REFERENCES runs(id) ON DELETE SET NULL
      );

      -- Small key/value store, e.g. the current session.
      CREATE TABLE app_state (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      -- Cached responses of external APIs.
      CREATE TABLE api_cache (
        key text PRIMARY KEY,
        payload jsonb NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
];
