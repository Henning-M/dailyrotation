// Formula 1 championship standings from Jolpica (successor of the Ergast API, no API key).
// Volunteer-run: responses of finished seasons are cached forever, so each season is fetched at most once.

import { config } from '../config.js';
import type { RankingCandidate } from '../../shared/types.js';
import type { Source, SourceContext } from './types.js';
import { formatNumber, randomInt, rankEntries } from './util.js';

type Kind = 'drivers' | 'constructors';

interface DriverStanding {
  position?: string;
  points: string;
  Driver: { givenName: string; familyName: string };
}
interface ConstructorStanding {
  position?: string;
  points: string;
  Constructor: { name: string };
}
interface StandingsResponse {
  MRData: {
    StandingsTable: {
      StandingsLists: { DriverStandings?: DriverStanding[]; ConstructorStandings?: ConstructorStanding[] }[];
    };
  };
}

const FIRST_SEASON: Record<Kind, number> = { drivers: 1950, constructors: 1958 }; // constructors' title since 1958

export function parseStandings(kind: Kind, season: number, json: StandingsResponse): RankingCandidate {
  const list = json.MRData.StandingsTable.StandingsLists[0];
  const rows: { label: string; position?: string; points: string }[] =
    kind === 'drivers'
      ? (list?.DriverStandings ?? []).map((r) => ({ ...r, label: `${r.Driver.givenName} ${r.Driver.familyName}` }))
      : (list?.ConstructorStandings ?? []).map((r) => ({ ...r, label: r.Constructor.name }));
  // The API delivers the official classification order; positions settle ties (e.g. by count-back).
  // Some old seasons list excluded entries without a position: they go to the end, in source order.
  const items = rows.map((r, i) => {
    const label = r.label;
    const position = r.position !== undefined ? Number(r.position) : NaN;
    const points = Number(r.points);
    return { label, value: Number.isFinite(position) ? position : 1000 + i, display: `${formatNumber(points)} pts` };
  });
  return {
    id: `f1:${kind}:${season}`,
    title: `Formula 1 ${kind === 'drivers' ? "Drivers'" : "Constructors'"} Championship ${season}`,
    source: 'Jolpica F1 API',
    entries: rankEntries(items, 'asc', { limit: 30 }),
  };
}

export const f1Source: Source = {
  id: 'f1',
  name: 'Formula 1 (Jolpica)',
  weight: 1,
  async generate(ctx: SourceContext) {
    const lastSeason = new Date().getUTCFullYear() - 1; // the current season may still be running
    for (let attempt = 0; attempt < 6; attempt++) {
      const kind: Kind = ctx.rng() < 0.6 ? 'drivers' : 'constructors';
      const season = randomInt(FIRST_SEASON[kind], lastSeason, ctx.rng);
      const id = `f1:${kind}:${season}`;
      if (ctx.excludeIds.has(id)) continue;
      const path = kind === 'drivers' ? 'driverStandings' : 'constructorStandings';
      const json = await ctx.fetchJson<StandingsResponse>(`${config.jolpicaBaseUrl}/${season}/${path}.json?limit=100`, {
        maxAgeMs: Infinity,
      });
      const candidate = parseStandings(kind, season, json);
      if (candidate.entries.length >= ctx.minEntries) return candidate;
    }
    return null;
  },
};
