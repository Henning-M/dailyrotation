// Show view (shared via screen share). Shows only the order until the moderator reveals the ranking.
// Tab title and URL stay neutral. Space / → = next speaker, ← = previous.

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { ShowState } from '../../shared/types';

export function Show() {
  const [state, setState] = useState<ShowState | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    document.title = 'Daily';
  }, []);

  const refresh = useCallback(async () => {
    try {
      setState(await api.show());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!state || state.phase === 'idle') return;
      if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        api.next().then(refresh, () => undefined);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        api.prev().then(refresh, () => undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, refresh]);

  if (!state || state.phase === 'idle') {
    return (
      <main className="show show-idle">
        <p>{state ? 'Waiting for the draw…' : 'Loading…'}</p>
      </main>
    );
  }

  return (
    <main className="show">
      {state.reveal && (
        <div className="show-reveal">
          <div className="show-reveal-kicker">It was…</div>
          <div className="show-reveal-title">{state.reveal.title}</div>
          <div className="show-reveal-source">Source: {state.reveal.source}</div>
        </div>
      )}
      <ol className="show-list">
        {state.rows.map((r) => (
          <li key={r.rank} className={r.status}>
            <span className="show-rank">#{r.rank}</span>
            <span className="show-label">{r.label}</span>
            <span className="show-dash">–</span>
            <span className="show-member">{r.memberName}</span>
            {r.value && <span className="show-value">{r.value}</span>}
          </li>
        ))}
      </ol>
      {offline && <div className="show-offline">connection lost – retrying</div>}
    </main>
  );
}
