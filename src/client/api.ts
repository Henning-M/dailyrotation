import type { Member, ModeratorState, Session, ShowState } from '../shared/types';

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 || res.status === 403) throw new Error('Not signed in – reload the page');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  state: () => call<ModeratorState>('GET', '/api/state'),
  show: () => call<ShowState>('GET', '/api/show'),

  addMember: (name: string, group: string | null) => call<Member>('POST', '/api/members', { name, group }),
  updateMember: (id: number, patch: Partial<Pick<Member, 'name' | 'group' | 'active'>>) =>
    call<Member>('PATCH', `/api/members/${id}`, patch),
  deleteMember: (id: number) => call('DELETE', `/api/members/${id}`),

  setPresent: (id: number, present: boolean) => call<Session>('POST', `/api/session/attendance/${id}`, { present }),
  loadSlot: (slot: number) => call<Session>('POST', `/api/session/slots/${slot}/load`),
  clearSlots: () => call<Session>('POST', '/api/session/slots/clear'),
  select: (candidateId: string) => call<Session>('POST', '/api/session/select', { candidateId }),
  draw: () => call<Session>('POST', '/api/session/draw'),
  speaker: (index: number) => call<Session>('POST', '/api/session/speaker', { index }),
  next: () => call<Session>('POST', '/api/session/next'),
  prev: () => call<Session>('POST', '/api/session/prev'),
  reveal: () => call<Session>('POST', '/api/session/reveal'),
  newDaily: () => call<Session>('POST', '/api/session/new'),

  deleteRun: (id: number) => call('DELETE', `/api/runs/${id}`),
};
