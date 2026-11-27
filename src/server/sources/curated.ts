// Curated fun lists from data/curated-lists.json (fixed, never generated at runtime).
// Lists with "reviewed": false are still suggested, but flagged as UNREVIEWED in the moderator view.
// Entries are listed in ranking order; ties are already resolved in the file.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RankingCandidate } from '../../shared/types.js';
import type { Source, SourceContext } from './types.js';
import { shuffle } from '../draw.js';

export interface CuratedList {
  id: string; // without "curated:" prefix
  title: string;
  source: string;
  reviewed: boolean;
  entries: { label: string; value?: string }[];
}

export const CURATED_FILE = path.join(process.cwd(), 'data', 'curated-lists.json');

let cache: CuratedList[] | null = null;

export async function loadCuratedLists(file = CURATED_FILE): Promise<CuratedList[]> {
  if (cache && file === CURATED_FILE) return cache;
  const json = JSON.parse(await readFile(file, 'utf8')) as { lists: CuratedList[] };
  validateCuratedLists(json.lists);
  if (file === CURATED_FILE) cache = json.lists;
  return json.lists;
}

export function validateCuratedLists(lists: CuratedList[]): void {
  const ids = new Set<string>();
  for (const l of lists) {
    if (!/^[a-z0-9-]+$/.test(l.id)) throw new Error(`Curated list id "${l.id}" must be kebab-case`);
    if (ids.has(l.id)) throw new Error(`Duplicate curated list id "${l.id}"`);
    ids.add(l.id);
    if (!l.title || !l.source) throw new Error(`Curated list "${l.id}" needs title and source`);
    const labels = new Set(l.entries.map((e) => e.label));
    if (labels.size !== l.entries.length) throw new Error(`Curated list "${l.id}" has duplicate entries`);
  }
}

export function toCandidate(l: CuratedList): RankingCandidate {
  return {
    id: `curated:${l.id}`,
    title: l.title,
    source: l.source,
    unreviewed: !l.reviewed,
    entries: l.entries.map((e, i) => ({ rank: i + 1, label: e.label, value: e.value })),
  };
}

export const curatedSource: Source = {
  id: 'curated',
  name: 'Curated lists',
  weight: 1,
  async generate(ctx: SourceContext) {
    const lists = await loadCuratedLists();
    const available = lists.filter((l) => !ctx.excludeIds.has(`curated:${l.id}`) && l.entries.length >= ctx.minEntries);
    if (available.length === 0) return null;
    return toCandidate(shuffle(available, ctx.rng)[0]);
  },
};
