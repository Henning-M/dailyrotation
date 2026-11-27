import { describe, expect, it } from 'vitest';
import { parseStandings } from '../src/server/sources/f1.js';
import { buildCandidate, countryNames, formatValue } from '../src/server/sources/worldbank.js';
import { INDICATORS } from '../src/server/sources/worldbank-indicators.js';
import { buildQuery, parseResults, TEMPLATES } from '../src/server/sources/wikidata.js';
import { loadCuratedLists, toCandidate, validateCuratedLists } from '../src/server/sources/curated.js';
import { isVaried, rankEntries } from '../src/server/sources/util.js';
import { weekStart, localDate } from '../src/server/week.js';

describe('rankEntries', () => {
  const items = [
    { label: 'B', value: 5 },
    { label: 'A', value: 5 },
    { label: 'C', value: 9 },
    { label: 'D', value: NaN },
    { label: '', value: 3 },
  ];
  it('sorts, drops invalid values/labels and assigns consecutive ranks', () => {
    const r = rankEntries(items, 'desc');
    expect(r.map((e) => [e.rank, e.label])).toEqual([
      [1, 'C'],
      [2, 'B'],
      [3, 'A'],
    ]);
  });
  it('keeps source order for ties, or alphabetical on request', () => {
    expect(rankEntries(items, 'asc').map((e) => e.label)).toEqual(['B', 'A', 'C']);
    expect(rankEntries(items, 'asc', { tieBreak: 'alphabetical' }).map((e) => e.label)).toEqual(['A', 'B', 'C']);
  });
});

describe('isVaried', () => {
  const e = (vals: string[]) => vals.map((v, i) => ({ rank: i + 1, label: `L${i}`, value: v }));
  it('rejects rankings whose top entries are mostly tied', () => {
    expect(isVaried(e(['0%', '0%', '0%', '0%', '0%', '0%', '0%', '0.1%', '1%', '2%']))).toBe(false);
    expect(isVaried(e(['9', '8', '7', '7', '6', '5', '4', '3', '2', '1']))).toBe(true);
  });
});

describe('F1 (Jolpica)', () => {
  it('parses driver standings in classification order', () => {
    const json = {
      MRData: {
        StandingsTable: {
          StandingsLists: [
            {
              DriverStandings: [
                { position: '1', points: '395.5', Driver: { givenName: 'Max', familyName: 'Verstappen' } },
                { position: '2', points: '387.5', Driver: { givenName: 'Lewis', familyName: 'Hamilton' } },
                { points: '0', Driver: { givenName: 'Excluded', familyName: 'Driver' } }, // no position
                { position: '3', points: '226', Driver: { givenName: 'Valtteri', familyName: 'Bottas' } },
              ],
            },
          ],
        },
      },
    };
    const c = parseStandings('drivers', 2021, json);
    expect(c.id).toBe('f1:drivers:2021');
    expect(c.title).toBe("Formula 1 Drivers' Championship 2021");
    expect(c.entries.map((e) => e.label)).toEqual(['Max Verstappen', 'Lewis Hamilton', 'Valtteri Bottas', 'Excluded Driver']);
    expect(c.entries[0]).toEqual({ rank: 1, label: 'Max Verstappen', value: '395.5 pts' });
  });

  it('parses constructor standings', () => {
    const json = {
      MRData: {
        StandingsTable: {
          StandingsLists: [
            {
              ConstructorStandings: [
                { position: '1', points: '48', Constructor: { name: 'Vanwall' } },
                { position: '2', points: '40', Constructor: { name: 'Ferrari' } },
              ],
            },
          ],
        },
      },
    };
    const c = parseStandings('constructors', 1958, json);
    expect(c.entries.map((e) => e.label)).toEqual(['Vanwall', 'Ferrari']);
  });

  it('copes with a season without standings', () => {
    const json = { MRData: { StandingsTable: { StandingsLists: [] } } };
    expect(parseStandings('drivers', 2030, json).entries).toEqual([]);
  });
});

describe('World Bank', () => {
  const countries = [
    { id: 'DEU', name: 'Germany', region: { id: 'ECS', value: 'Europe & Central Asia' } },
    { id: 'KOR', name: 'Korea, Rep.', region: { id: 'EAS', value: 'East Asia & Pacific' } },
    { id: 'NER', name: 'Niger', region: { id: 'SSF', value: 'Sub-Saharan Africa' } },
    { id: 'ARB', name: 'Arab World', region: { id: 'NA', value: 'Aggregates' } },
    { id: 'EMU', name: 'Euro area', region: { id: 'NA', value: 'Aggregates' } },
  ];
  const point = (iso: string, value: number | null) => ({ countryiso3code: iso, country: { id: iso.slice(0, 2), value: iso }, value });

  it('filters aggregates and prettifies names', () => {
    const names = countryNames(countries);
    expect([...names.keys()]).toEqual(['DEU', 'KOR', 'NER']);
    expect(names.get('KOR')).toBe('South Korea');
  });

  it('builds a ranking without aggregates and null values', () => {
    const ind = INDICATORS.find((i) => i.code === 'SP.DYN.TFRT.IN')!;
    const data = [point('ARB', 6.5), point('NER', 7.7), point('DEU', 1.37), point('KOR', null), point('EMU', 1.5)];
    const c = buildCandidate(ind, 1985, 'desc', data, countryNames(countries));
    expect(c.id).toBe('worldbank:SP.DYN.TFRT.IN:1985:desc');
    expect(c.title).toBe('Fertility rate (births per woman), countries, 1985 – highest first');
    expect(c.entries).toEqual([
      { rank: 1, label: 'Niger', value: '7.7 births/woman' },
      { rank: 2, label: 'Germany', value: '1.37 births/woman' },
    ]);
    const asc = buildCandidate(ind, 1985, 'asc', data, countryNames(countries));
    expect(asc.entries[0].label).toBe('Germany');
    expect(asc.title).toMatch(/lowest first$/);
  });

  it('formats values', () => {
    const byCode = (code: string) => INDICATORS.find((i) => i.code === code)!;
    expect(formatValue(byCode('NY.GDP.PCAP.CD'), 48123.4)).toBe('$48,123');
    expect(formatValue(byCode('IT.NET.USER.ZS'), 91.234)).toBe('91.2%');
    expect(formatValue(byCode('SP.POP.TOTL'), 83_200_000)).toBe('83.2M');
  });

  it('has sane indicator definitions', () => {
    for (const ind of INDICATORS) expect(ind.years[0]).toBeLessThanOrEqual(ind.years[1]);
  });
});

describe('Wikidata', () => {
  it('builds queries with the parameter and language filled in', () => {
    const t = TEMPLATES.find((x) => x.key === 'mountains')!;
    const q = buildQuery(t, 'Q39', 'en');
    expect(q).toContain('wdt:P17 wd:Q39');
    expect(q).toContain('wikibase:language "en"');
    expect(q).not.toContain('$P');
  });

  it('drops missing labels/values and duplicates, scales values', () => {
    const t = TEMPLATES.find((x) => x.key === 'rivers')!;
    const b = (item: string, label: string | undefined, value: string | undefined) => ({
      item: { value: `http://www.wikidata.org/entity/${item}` },
      ...(label !== undefined ? { itemLabel: { value: label } } : {}),
      ...(value !== undefined ? { value: { value } } : {}),
    });
    const json = {
      results: {
        bindings: [
          b('Q584', 'Rhine', '1233000'),
          b('Q1653', 'Danube', '2850000'),
          b('Q999', 'Q999', '5000000'), // no label
          b('Q1', 'Elbe', undefined), // no value
          b('Q2', 'rhine', '1000'), // duplicate label
          b('Q584', 'Rhine', '1233000'), // duplicate item
        ],
      },
    };
    const entries = parseResults(t, json);
    expect(entries).toEqual([
      { rank: 1, label: 'Danube', value: '2,850 km' },
      { rank: 2, label: 'Rhine', value: '1,233 km' },
    ]);
  });
});

describe('Curated lists', () => {
  it('the shipped file is valid and every list has at least 10 entries', async () => {
    const lists = await loadCuratedLists();
    expect(lists.length).toBeGreaterThanOrEqual(20);
    for (const l of lists) expect(l.entries.length, l.id).toBeGreaterThanOrEqual(10);
  });

  it('rejects duplicate ids and entries', () => {
    const l = { id: 'x', title: 'X', source: 'S', reviewed: true, entries: [{ label: 'a' }] };
    expect(() => validateCuratedLists([l, l])).toThrow(/Duplicate/);
    expect(() => validateCuratedLists([{ ...l, entries: [{ label: 'a' }, { label: 'a' }] }])).toThrow(/duplicate entries/);
    expect(() => validateCuratedLists([{ ...l, id: 'Not Kebab' }])).toThrow(/kebab/);
  });

  it('converts to a candidate with consecutive ranks and the review flag', () => {
    const c = toCandidate({ id: 'x', title: 'X', source: 'S', reviewed: false, entries: [{ label: 'a', value: '1' }, { label: 'b' }] });
    expect(c).toMatchObject({ id: 'curated:x', unreviewed: true });
    expect(c.entries).toEqual([
      { rank: 1, label: 'a', value: '1' },
      { rank: 2, label: 'b', value: undefined },
    ]);
  });
});

describe('week helpers', () => {
  it('computes local date and Monday in Europe/Berlin', () => {
    // Sunday 23:30 UTC = Monday 00:30 in Berlin (winter time)
    expect(localDate(new Date('2026-11-29T23:30:00Z'), 'Europe/Berlin')).toBe('2026-11-30');
    expect(weekStart(new Date('2026-11-29T23:30:00Z'), 'Europe/Berlin')).toBe('2026-11-30');
    expect(weekStart(new Date('2026-11-27T09:00:00Z'), 'Europe/Berlin')).toBe('2026-11-23');
    expect(weekStart(new Date('2026-11-23T00:00:00Z'), 'Europe/Berlin')).toBe('2026-11-23');
  });
});
