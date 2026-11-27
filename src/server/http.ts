// HTTP JSON fetching with a database-backed cache.

import { config } from './config.js';
import type { Repo } from './repo.js';
import { SourceError, type FetchOptions } from './sources/types.js';

export function createFetchJson(repo: Repo) {
  return async function fetchJson<T>(url: string, opts: FetchOptions): Promise<T> {
    const key = opts.cacheKey ?? url;
    const cached = await repo.cacheGet(key, opts.maxAgeMs);
    if (cached !== undefined) return cached as T;

    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? 'GET',
        body: opts.body,
        headers: { 'User-Agent': config.userAgent, Accept: 'application/json', ...opts.headers },
        signal: AbortSignal.timeout(opts.timeoutMs ?? config.httpTimeoutMs),
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : String(err);
      throw new SourceError(`${new URL(url).host}: request ${reason}`);
    }
    if (!res.ok) throw new SourceError(`${new URL(url).host}: HTTP ${res.status}`);
    const json = (await res.json()) as T;
    await repo.cachePut(key, json);
    return json;
  };
}
