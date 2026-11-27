import type { RankingCandidate } from '../../shared/types.js';
import type { Rng } from '../draw.js';

export interface FetchOptions {
  cacheKey?: string; // defaults to the URL
  maxAgeMs: number; // how long a cached response is valid (Infinity = forever)
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  timeoutMs?: number; // defaults to HTTP_TIMEOUT_MS
  body?: string;
}

export interface SourceContext {
  rng: Rng;
  /** Minimum number of entries a ranking must have. */
  minEntries: number;
  /** Rankings that must not be suggested (already used or currently shown). */
  excludeIds: Set<string>;
  /** Fetches JSON with caching in the database. */
  fetchJson<T = unknown>(url: string, opts: FetchOptions): Promise<T>;
}

/**
 * A ranking source. To add a new one: create a file in this folder that exports a Source
 * and add it to the list in registry.ts.
 */
export interface Source {
  id: string; // short, stable, used as prefix of candidate ids
  name: string; // shown in the moderator view
  weight: number; // relative probability of being picked for a suggestion slot
  /** Returns a fresh candidate, or null if this source has nothing (left) that fits. */
  generate(ctx: SourceContext): Promise<RankingCandidate | null>;
}

export const DAY = 24 * 60 * 60 * 1000;

export class SourceError extends Error {}
