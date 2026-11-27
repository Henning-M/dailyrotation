// Wikidata Query Service (SPARQL, CC0, no API key).
// Parametrised query templates; the endpoint URL is configurable (WIKIDATA_SPARQL_URL) because
// Wikidata is moving its query service to a new backend.

import { config } from '../config.js';
import type { RankingCandidate } from '../../shared/types.js';
import { DAY, type Source, type SourceContext } from './types.js';
import { formatNumber, isVaried, pickRandom, randomInt, rankEntries } from './util.js';

interface Param {
  qid: string; // e.g. "Q39"
  name: string; // e.g. "Switzerland"
}

export interface Template {
  key: string;
  title: (p: Param) => string;
  params: Param[] | 'year';
  years?: [number, number];
  /** SPARQL graph pattern binding ?item and ?v (the value to rank by). $P is replaced by the parameter. */
  pattern: string;
  /** Converts the raw value (SI units for normalised quantities) into the ranked number. */
  scale?: number;
  /** Values above this (after scaling) are treated as data errors and dropped. */
  maxValue?: number;
  format: (v: number) => string;
}

const C = (qid: string, name: string): Param => ({ qid, name });

// Normalised quantity value (meters, square meters ...) of property $PROP, ignoring deprecated statements.
// Things that no longer exist (demolished, dissolved ...).
const NOT_GONE = 'FILTER NOT EXISTS { ?item wdt:P576 [] }';

const quantity = (prop: string) =>
  `?item p:${prop} ?st . ?st psn:${prop}/wikibase:quantityAmount ?v ; wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank)`;

export const TEMPLATES: Template[] = [
  {
    key: 'mountains',
    title: (p) => `Highest mountains in ${p.name}`,
    params: [C('Q39', 'Switzerland'), C('Q40', 'Austria'), C('Q38', 'Italy'), C('Q142', 'France'), C('Q20', 'Norway'), C('Q17', 'Japan'), C('Q29', 'Spain'), C('Q664', 'New Zealand'), C('Q183', 'Germany'), C('Q298', 'Chile')],
    pattern: `?item wdt:P31 wd:Q8502 ; wdt:P17 wd:$P . ${quantity('P2044')}`,
    format: (v) => `${formatNumber(v, 0)} m`,
  },
  {
    key: 'cities',
    title: (p) => `Largest cities in ${p.name} by population`,
    params: [C('Q183', 'Germany'), C('Q142', 'France'), C('Q38', 'Italy'), C('Q29', 'Spain'), C('Q145', 'the United Kingdom'), C('Q17', 'Japan'), C('Q36', 'Poland'), C('Q55', 'the Netherlands'), C('Q40', 'Austria'), C('Q39', 'Switzerland'), C('Q16', 'Canada'), C('Q408', 'Australia'), C('Q96', 'Mexico'), C('Q155', 'Brazil')],
    pattern: `?item wdt:P31/wdt:P279* wd:Q515 ; wdt:P17 wd:$P ; wdt:P1082 ?v .
      FILTER NOT EXISTS { ?item wdt:P31 wd:Q1907114 } ${NOT_GONE}`,
    format: (v) => formatNumber(v, 0),
  },
  {
    key: 'rivers',
    title: (p) => `Longest rivers in ${p.name}`,
    params: [C('Q183', 'Germany'), C('Q142', 'France'), C('Q36', 'Poland'), C('Q29', 'Spain'), C('Q38', 'Italy'), C('Q40', 'Austria'), C('Q39', 'Switzerland'), C('Q45', 'Portugal')],
    pattern: `?item wdt:P31 wd:Q4022 ; wdt:P17 wd:$P . ${quantity('P2043')}`,
    scale: 1 / 1000,
    format: (v) => `${formatNumber(v, 0)} km`,
  },
  {
    key: 'lakes',
    title: (p) => `Largest lakes in ${p.name} by area`,
    params: [C('Q33', 'Finland'), C('Q34', 'Sweden'), C('Q39', 'Switzerland'), C('Q38', 'Italy'), C('Q20', 'Norway'), C('Q40', 'Austria')],
    pattern: `?item wdt:P31 wd:Q23397 ; wdt:P17 wd:$P . ${quantity('P2046')}`,
    scale: 1 / 1_000_000,
    format: (v) => `${formatNumber(v, v < 10 ? 1 : 0)} km²`,
  },
  {
    key: 'skyscrapers',
    title: (p) => `Tallest skyscrapers in ${p.name}`,
    params: [C('Q30', 'the United States'), C('Q148', 'China'), C('Q878', 'the United Arab Emirates'), C('Q17', 'Japan'), C('Q183', 'Germany'), C('Q145', 'the United Kingdom'), C('Q16', 'Canada'), C('Q408', 'Australia'), C('Q884', 'South Korea'), C('Q833', 'Malaysia')],
    pattern: `?item wdt:P31 wd:Q11303 ; wdt:P17 wd:$P . ${NOT_GONE}
      FILTER EXISTS { ?item wdt:P1619|wdt:P571 [] } ${quantity('P2048')}`,
    maxValue: 830,
    format: (v) => `${formatNumber(v, 0)} m`,
  },
  {
    key: 'stadiums',
    title: (p) => `Largest stadiums in ${p.name} by capacity`,
    params: [C('Q183', 'Germany'), C('Q145', 'the United Kingdom'), C('Q29', 'Spain'), C('Q38', 'Italy'), C('Q155', 'Brazil'), C('Q30', 'the United States'), C('Q142', 'France')],
    pattern: `?item wdt:P31/wdt:P279* wd:Q483110 ; wdt:P17 wd:$P ; wdt:P1083 ?v . ${NOT_GONE}`,
    maxValue: 140000,
    format: (v) => formatNumber(v, 0),
  },
  {
    key: 'films',
    title: (p) => `Highest-grossing films released in ${p.name}`,
    params: 'year',
    years: [1990, 2023],
    pattern: `?item wdt:P31 wd:Q11424 ; wdt:P577 ?date . FILTER(YEAR(?date) = $P)
      FILTER NOT EXISTS { ?item wdt:P577 ?earlier . FILTER(YEAR(?earlier) < $P) }
      ?item p:P2142 ?st . ?st psv:P2142 ?q . ?q wikibase:quantityAmount ?v ; wikibase:quantityUnit wd:Q4917 .`,
    format: (v) => `$${formatNumber(v / 1_000_000, 0)}M`,
  },
];

export function buildQuery(t: Template, param: string, language: string): string {
  return `SELECT ?item ?itemLabel (MAX(?v) AS ?value) WHERE {
  ${t.pattern.replaceAll('$P', param)}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${language}". }
}
GROUP BY ?item ?itemLabel
ORDER BY DESC(?value)
LIMIT 60`;
}

interface SparqlResponse {
  results: { bindings: { item: { value: string }; itemLabel?: { value: string }; value?: { value: string } }[] };
}

/** Plausibility: drop rows without value or label (bare Q-ids), and duplicate items/labels. */
export function parseResults(t: Template, json: SparqlResponse) {
  const seenItems = new Set<string>();
  const seenLabels = new Set<string>();
  const items = [];
  for (const b of json.results.bindings) {
    const label = b.itemLabel?.value?.trim();
    const raw = Number(b.value?.value);
    if (!label || /^Q\d+$/.test(label) || !Number.isFinite(raw) || raw <= 0) continue;
    if (seenItems.has(b.item.value) || seenLabels.has(label.toLowerCase())) continue;
    seenItems.add(b.item.value);
    seenLabels.add(label.toLowerCase());
    const v = raw * (t.scale ?? 1);
    if (t.maxValue !== undefined && v > t.maxValue) continue;
    items.push({ label, value: v, display: t.format(v) });
  }
  return rankEntries(items, 'desc', { limit: 30 });
}

export const wikidataSource: Source = {
  id: 'wikidata',
  name: 'Wikidata',
  weight: 1,
  async generate(ctx: SourceContext) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const t = pickRandom(TEMPLATES, ctx.rng);
      let param: Param;
      if (t.params === 'year') {
        const y = randomInt(t.years![0], t.years![1], ctx.rng);
        param = { qid: String(y), name: String(y) };
      } else {
        param = pickRandom(t.params, ctx.rng);
      }
      const id = `wikidata:${t.key}:${param.qid}`;
      if (ctx.excludeIds.has(id)) continue;
      const query = buildQuery(t, param.qid, config.wikidataLanguage);
      const url = `${config.wikidataSparqlUrl}?format=json&query=${encodeURIComponent(query)}`;
      const json = await ctx.fetchJson<SparqlResponse>(url, {
        cacheKey: `wikidata:${id}:${config.wikidataLanguage}`,
        maxAgeMs: 30 * DAY,
        timeoutMs: config.wikidataTimeoutMs,
        headers: { Accept: 'application/sparql-results+json' },
      });
      const entries = parseResults(t, json);
      if (entries.length >= ctx.minEntries && isVaried(entries)) {
        const candidate: RankingCandidate = { id, title: t.title(param), source: 'Wikidata', entries };
        return candidate;
      }
    }
    return null;
  },
};
