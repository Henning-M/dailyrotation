// Picks a source for a suggestion slot and asks it for a candidate.
// Sources already shown in other slots are avoided where possible, so the suggestions are mixed.
// If a source fails or has nothing left, the next source is tried.

import type { RankingCandidate } from '../shared/types.js';
import type { Rng } from './draw.js';
import { weightedPick } from './draw.js';
import type { Source, SourceContext } from './sources/types.js';

export interface SuggestResult {
  candidate: RankingCandidate;
  sourceId: string;
}

/** Order in which sources are tried: weighted random, sources not shown elsewhere first. */
export function sourceOrder(sources: Source[], avoid: Set<string>, rng: Rng): Source[] {
  const order: Source[] = [];
  const pool = [...sources];
  while (pool.length > 0) {
    const fresh = pool.filter((s) => !avoid.has(s.id));
    const s = weightedPick(fresh.length > 0 ? fresh : pool, (x) => x.weight, rng);
    order.push(s);
    pool.splice(pool.indexOf(s), 1);
  }
  return order;
}

/** Tries the sources in the given order (see sourceOrder) until one delivers a suitable candidate. */
export async function suggest(
  orderedSources: Source[],
  ctx: SourceContext,
  log: (msg: string) => void = console.warn,
): Promise<SuggestResult> {
  const errors: string[] = [];
  for (const source of orderedSources) {
    try {
      const candidate = await source.generate(ctx);
      if (candidate && candidate.entries.length >= ctx.minEntries && !ctx.excludeIds.has(candidate.id)) {
        return { candidate, sourceId: source.id };
      }
      errors.push(`${source.name}: nothing suitable found`);
    } catch (err) {
      const msg = `${source.name}: ${err instanceof Error ? err.message : String(err)}`;
      log(`[suggest] ${msg}`);
      errors.push(msg);
    }
  }
  throw new Error(`No suggestion available (${errors.join('; ')})`);
}
