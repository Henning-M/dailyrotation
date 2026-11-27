import type { RankingEntry } from '../../shared/types.js';
import type { Rng } from '../draw.js';

export interface RawItem {
  label: string;
  value: number;
  display?: string; // formatted value; defaults to the number
}

/**
 * Sorts by value and assigns consecutive ranks 1..n.
 * Ties keep the order in which the source delivered them (stable sort);
 * pass `tieBreak: 'alphabetical'` to order ties by label instead.
 */
export function rankEntries(
  items: RawItem[],
  direction: 'desc' | 'asc',
  opts: { limit?: number; tieBreak?: 'source' | 'alphabetical' } = {},
): RankingEntry[] {
  const sign = direction === 'desc' ? -1 : 1;
  const sorted = items
    .filter((it) => Number.isFinite(it.value) && it.label.trim() !== '')
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const byValue = sign * (a.it.value - b.it.value);
      if (byValue !== 0) return byValue;
      if (opts.tieBreak === 'alphabetical') return a.it.label.localeCompare(b.it.label, 'en');
      return a.i - b.i;
    })
    .slice(0, opts.limit ?? Infinity);
  return sorted.map(({ it }, i) => ({ rank: i + 1, label: it.label, value: it.display ?? String(it.value) }));
}

export function pickRandom<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

export function randomInt(min: number, max: number, rng: Rng): number {
  return min + Math.floor(rng() * (max - min + 1));
}

const nf = (digits: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export function formatNumber(value: number, digits = 1): string {
  return nf(digits).format(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/**
 * Plausibility check: a ranking whose top entries mostly share the same value (e.g. ten countries with 0 %)
 * makes a boring, arbitrary order. Requires at least `minDistinct` different values among the top `top`.
 */
export function isVaried(entries: RankingEntry[], top = 10, minDistinct = 6): boolean {
  const values = entries.slice(0, top).map((e) => e.value);
  return new Set(values).size >= Math.min(minDistinct, values.length);
}
