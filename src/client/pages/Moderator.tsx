// Moderator view (NOT shared): team, attendance, suggestions, draw, speaker control, reveal, history.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { ModeratorState, SuggestionSlot } from '../../shared/types';
import { TeamPanel } from '../components/TeamPanel';
import { ConfirmButton } from '../components/ConfirmButton';

export function Moderator() {
  const [state, setState] = useState<ModeratorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Daily · Moderator';
  }, []);

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Keep in sync with the show view (speaker changes there) and with slots that are still loading.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  /** Runs an action, shows its error, then reloads the state. */
  const run = useCallback(
    async (fn: () => Promise<unknown>, opts: { blocking?: boolean } = { blocking: true }) => {
      setError(null);
      if (opts.blocking) setBusy(true);
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        if (opts.blocking) setBusy(false);
        await refresh();
      }
    },
    [refresh],
  );

  if (!state) return <div className="mod-loading">{error ?? 'Loading…'}</div>;

  const { session, members } = state;
  const presentCount = members.filter((m) => m.active && session.attendance.includes(m.id)).length;

  const loadSlot = (slot: number) => {
    // optimistic "loading" state; the request itself can take up to ~20 s (Wikidata)
    setState((s) =>
      s && {
        ...s,
        session: { ...s.session, slots: s.session.slots.map((x) => (x.slot === slot ? { slot, status: 'loading' } : x)) },
      },
    );
    run(() => api.loadSlot(slot), { blocking: false });
  };
  const loadAll = (onlyMissing: boolean) => {
    session.slots.filter((x) => !onlyMissing || x.status === 'empty' || x.status === 'error').forEach((x) => loadSlot(x.slot));
  };

  return (
    <div className="mod">
      <header className="mod-header">
        <h1>🎲 Daily Ranking Roulette</h1>
        <div className="mod-header-actions">
          <a className="btn" href="/show" target="_blank" rel="noreferrer">
            Open show view ↗
          </a>
          <ConfirmButton label="New daily" confirmLabel="Reset session?" onConfirm={() => run(api.newDaily)} disabled={busy} />
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error} <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="mod-grid">
        <section className="card team">
          <h2>
            1 · Team & attendance <span className="muted">({presentCount} present)</span>
          </h2>
          <TeamPanel members={members} attendance={session.attendance} run={run} disabled={session.revealed} />
        </section>

        <section className="card suggestions">
          <h2>2 · Pick a ranking</h2>
          <div className="row">
            <button className="btn primary" onClick={() => loadAll(true)} disabled={session.revealed}>
              Get suggestions
            </button>
            <button className="btn" onClick={() => loadAll(false)} disabled={session.revealed}>
              Reroll all
            </button>
            <span className="muted small">
              Sources: {state.sources.map((s) => s.name).join(', ')} · {state.usedRankingCount} rankings used so far
            </span>
          </div>
          <div className="slots">
            {session.slots.map((slot) => (
              <SlotCard
                key={slot.slot}
                slot={slot}
                n={presentCount}
                selected={slot.candidate?.id === session.selectedId}
                locked={session.revealed}
                onSelect={() => run(() => api.select(slot.candidate!.id))}
                onReroll={() => loadSlot(slot.slot)}
              />
            ))}
          </div>
        </section>

        <section className="card daily">
          <h2>3 · Draw & run the daily</h2>
          <DailyPanel state={state} busy={busy} run={run} presentCount={presentCount} />
        </section>

        <section className="card history">
          <h2>This week</h2>
          {state.runsThisWeek.length === 0 ? (
            <p className="muted">No dailies revealed this week yet.</p>
          ) : (
            <ul className="history-list">
              {state.runsThisWeek.map((r) => (
                <li key={r.id}>
                  <span className="mono">{formatDay(r.dailyDate)}</span>
                  <span className="grow">
                    <strong>{r.firstMemberName}</strong> started · {r.title}
                  </span>
                  <ConfirmButton
                    small
                    label="Delete"
                    confirmLabel="Delete run?"
                    title="Removes the run from the history (fairness) and frees the ranking again"
                    onConfirm={() => run(() => api.deleteRun(r.id))}
                  />
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">Only the current week is kept. Fairness for #1 is based on these runs.</p>
        </section>
      </div>
    </div>
  );
}

function SlotCard(props: {
  slot: SuggestionSlot;
  n: number;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
  onReroll: () => void;
}) {
  const { slot, n, selected, locked } = props;
  const c = slot.candidate;
  const tooShort = c ? c.entries.length < n : false;
  return (
    <div className={`slot ${selected ? 'selected' : ''} ${slot.status}`}>
      {slot.status === 'empty' && <p className="muted">Empty</p>}
      {slot.status === 'loading' && <p className="muted pulse">Looking for a ranking…</p>}
      {slot.status === 'error' && <p className="error-text">{slot.error}</p>}
      {c && (
        <>
          <div className="slot-meta">
            <span className="badge">{c.source}</span>
            {c.unreviewed && (
              <span className="badge warn" title="Curated list that has not been reviewed yet – check before using">
                unreviewed
              </span>
            )}
          </div>
          <h3>{c.title}</h3>
          <ol className="preview">
            {c.entries.slice(0, Math.max(n, 1)).map((e) => (
              <li key={e.rank}>
                <span>{e.label}</span>
                {e.value && <span className="muted">{e.value}</span>}
              </li>
            ))}
          </ol>
          {tooShort && <p className="error-text">Only {c.entries.length} entries for {n} people</p>}
        </>
      )}
      <div className="row slot-actions">
        {c && (
          <button className="btn primary" onClick={props.onSelect} disabled={locked || selected || tooShort}>
            {selected ? '✓ Selected' : 'Select'}
          </button>
        )}
        <button className="btn" onClick={props.onReroll} disabled={locked}>
          {slot.status === 'empty' ? 'Get one' : 'Reroll'}
        </button>
      </div>
    </div>
  );
}

function DailyPanel(props: {
  state: ModeratorState;
  busy: boolean;
  presentCount: number;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { state, busy, run, presentCount } = props;
  const s = state.session;
  const currentRef = useRef<HTMLLIElement>(null);

  if (!s.selected) return <p className="muted">Select one of the suggestions first.</p>;

  const allDone = s.assignment ? s.currentIndex >= s.assignment.length : false;

  return (
    <div>
      <p>
        Ranking: <strong>{s.selected.title}</strong> <span className="muted">({s.selected.source})</span>
      </p>
      <div className="row">
        <button className="btn primary" onClick={() => run(api.draw)} disabled={busy || s.revealed || presentCount === 0}>
          {s.assignment ? 'Draw again' : 'Draw'}
        </button>
        {s.drawInfo && (
          <span className="muted small">
            Weights for #1:{' '}
            {s.drawInfo.weights.map((w) => (
              <span key={w.memberId} className="weight">
                {w.memberName} ×{w.weight}
              </span>
            ))}
          </span>
        )}
      </div>

      {s.assignment && (
        <>
          <ol className="order">
            {s.assignment.map((a, i) => (
              <li
                key={a.rank}
                ref={i === s.currentIndex ? currentRef : undefined}
                className={i < s.currentIndex ? 'done' : i === s.currentIndex ? 'current' : ''}
                onClick={() => run(() => api.speaker(i))}
                title="Click to make this the current speaker"
              >
                <span className="rank">#{a.rank}</span>
                <span className="grow">{a.label}</span>
                <span className="who">{a.memberName}</span>
                {a.value && <span className="muted small">{a.value}</span>}
              </li>
            ))}
          </ol>
          <div className="row">
            <button className="btn" onClick={() => run(api.prev)} disabled={busy || s.currentIndex <= 0}>
              ← Previous
            </button>
            <button className="btn" onClick={() => run(api.next)} disabled={busy || allDone}>
              Next speaker →
            </button>
            <span className="grow" />
            {!s.revealed ? (
              <button className="btn reveal" onClick={() => run(api.reveal)} disabled={busy}>
                Reveal ranking
              </button>
            ) : (
              <span className="badge ok">Revealed & saved</span>
            )}
          </div>
          <p className="muted small">The show view also reacts to Space / → (next) and ← (previous).</p>
        </>
      )}
    </div>
  );
}

function formatDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
}
