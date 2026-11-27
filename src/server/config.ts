// All settings come from environment variables (see README).

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3000),
  production: env.NODE_ENV === 'production',

  // Database: DATABASE_URL, or DB_HOST (+ DB_NAME/DB_USER/DB_PASSWORD; DB_HOST may be a Cloud SQL socket dir).
  // Neither set -> embedded Postgres (PGlite) in PGLITE_DIR, for local development.
  databaseUrl: env.DATABASE_URL,
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT ? Number(env.DB_PORT) : undefined,
    database: env.DB_NAME ?? 'daily_rotation',
    user: env.DB_USER ?? 'daily_app',
    password: env.DB_PASSWORD,
  },
  pgliteDir: env.PGLITE_DIR ?? '.data/pglite',

  timeZone: env.TEAM_TIME_ZONE ?? 'Europe/Berlin',
  fairnessMaxWeight: Number(env.FAIRNESS_MAX_WEIGHT ?? 5),
  minEntries: Number(env.MIN_ENTRIES ?? 10), // rankings need at least max(minEntries, present people)
  suggestionSlots: Number(env.SUGGESTION_SLOTS ?? 4),

  httpTimeoutMs: Number(env.HTTP_TIMEOUT_MS ?? 25000),
  wikidataTimeoutMs: Number(env.WIKIDATA_TIMEOUT_MS ?? 55000), // some queries take 30-50 s
  userAgent: env.HTTP_USER_AGENT ?? 'daily-ranking-roulette/1.0 (small internal tool; low request volume)',
  wikidataSparqlUrl: env.WIKIDATA_SPARQL_URL ?? 'https://query.wikidata.org/sparql',
  wikidataLanguage: env.WIKIDATA_LANGUAGE ?? 'en', // label language(s), e.g. "en" or "de,en"
  jolpicaBaseUrl: env.JOLPICA_BASE_URL ?? 'https://api.jolpi.ca/ergast/f1',
  worldBankBaseUrl: env.WORLDBANK_BASE_URL ?? 'https://api.worldbank.org/v2',
};
