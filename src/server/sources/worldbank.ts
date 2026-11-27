// World Bank Indicators API (no API key, CC BY 4.0).
// A candidate = curated indicator x year x direction, e.g. "worldbank:SP.DYN.TFRT.IN:1985:desc".

import { config } from '../config.js';
import type { RankingCandidate } from '../../shared/types.js';
import { DAY, type Source, type SourceContext } from './types.js';
import { formatCompact, formatNumber, isVaried, pickRandom, randomInt, rankEntries } from './util.js';
import { INDICATORS, type Indicator } from './worldbank-indicators.js';

interface WbCountry {
  id: string; // ISO3
  name: string;
  region: { id: string; value: string };
}
interface WbDataPoint {
  countryiso3code: string;
  country: { id: string; value: string };
  value: number | null;
}
type WbResponse<T> = [{ page: number; pages: number; total: number } | { message: unknown }, T[] | null];

// World Bank names that read badly in a daily stand-up.
const NAME_OVERRIDES: Record<string, string> = {
  BHS: 'Bahamas',
  BRN: 'Brunei',
  COD: 'DR Congo',
  COG: 'Republic of the Congo',
  EGY: 'Egypt',
  FSM: 'Micronesia',
  GMB: 'Gambia',
  HKG: 'Hong Kong',
  IRN: 'Iran',
  KGZ: 'Kyrgyzstan',
  KNA: 'Saint Kitts and Nevis',
  KOR: 'South Korea',
  LAO: 'Laos',
  LCA: 'Saint Lucia',
  MAC: 'Macao',
  PRK: 'North Korea',
  RUS: 'Russia',
  SVK: 'Slovakia',
  SYR: 'Syria',
  TUR: 'Türkiye',
  VCT: 'Saint Vincent and the Grenadines',
  VEN: 'Venezuela',
  VNM: 'Vietnam',
  YEM: 'Yemen',
  PSE: 'Palestine',
  CIV: "Côte d'Ivoire",
  STP: 'São Tomé and Príncipe',
  CUW: 'Curaçao',
  MAF: 'Saint Martin',
  NRU: 'Nauru',
  VIR: 'U.S. Virgin Islands',
};

/** Real countries only: aggregates ("Euro area", "High income", ...) have region id "NA". */
export function countryNames(countries: WbCountry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of countries) {
    if (!c.region || c.region.id === 'NA' || c.region.value === 'Aggregates') continue;
    map.set(c.id, NAME_OVERRIDES[c.id] ?? c.name);
  }
  return map;
}

export function formatValue(ind: Indicator, value: number): string {
  switch (ind.format) {
    case 'percent':
      return `${formatNumber(value, ind.digits ?? 1)}%`;
    case 'usd':
      return `$${formatNumber(value, 0)}`;
    case 'compact':
      return formatCompact(value);
    default:
      return `${formatNumber(value, ind.digits ?? 1)}${ind.unit ? ` ${ind.unit}` : ''}`;
  }
}

export function buildCandidate(
  ind: Indicator,
  year: number,
  direction: 'desc' | 'asc',
  data: WbDataPoint[],
  names: Map<string, string>,
): RankingCandidate {
  const seen = new Set<string>();
  const items = [];
  for (const d of data) {
    const iso = d.countryiso3code || d.country.id;
    const name = names.get(iso);
    if (!name || d.value === null || seen.has(iso)) continue;
    seen.add(iso);
    items.push({ label: name, value: d.value, display: formatValue(ind, d.value) });
  }
  return {
    id: `worldbank:${ind.code}:${year}:${direction}`,
    title: `${ind.title}, countries, ${year} – ${direction === 'desc' ? ind.highLabel ?? 'highest' : ind.lowLabel ?? 'lowest'} first`,
    source: 'World Bank Open Data',
    entries: rankEntries(items, direction, { limit: 30, tieBreak: 'alphabetical' }),
  };
}

export const worldBankSource: Source = {
  id: 'worldbank',
  name: 'World Bank indicators',
  weight: 1,
  async generate(ctx: SourceContext) {
    const countries = await ctx.fetchJson<WbResponse<WbCountry>>(`${config.worldBankBaseUrl}/country?format=json&per_page=400`, {
      maxAgeMs: 30 * DAY,
    });
    const names = countryNames(countries[1] ?? []);
    for (let attempt = 0; attempt < 6; attempt++) {
      const ind = pickRandom(INDICATORS, ctx.rng);
      const year = randomInt(ind.years[0], ind.years[1], ctx.rng);
      const direction = pickRandom(ind.directions ?? (['desc', 'asc'] as const), ctx.rng);
      const id = `worldbank:${ind.code}:${year}:${direction}`;
      if (ctx.excludeIds.has(id)) continue;
      const json = await ctx.fetchJson<WbResponse<WbDataPoint>>(
        `${config.worldBankBaseUrl}/country/all/indicator/${ind.code}?date=${year}&format=json&per_page=500`,
        { maxAgeMs: 30 * DAY },
      );
      if (!Array.isArray(json) || !json[1]) continue; // unknown indicator or no data for this year
      const candidate = buildCandidate(ind, year, direction, json[1], names);
      if (candidate.entries.length >= ctx.minEntries && isVaried(candidate.entries)) return candidate;
    }
    return null;
  },
};
