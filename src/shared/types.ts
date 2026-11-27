// Types shared between server and client.

export interface RankingEntry {
  rank: number; // 1-based, always consecutive (1..n), ties already resolved
  label: string;
  value?: string; // human-readable value, e.g. "395.5 pts"
}

export interface RankingCandidate {
  id: string; // stable id used for "already used", e.g. "f1:drivers:2021"
  title: string;
  source: string; // human-readable source name
  entries: RankingEntry[];
  unreviewed?: boolean; // curated lists that have not been reviewed yet
}

export interface Member {
  id: number;
  name: string;
  group: string | null; // members of the same group always speak back-to-back
  active: boolean; // false = archived (rotated out of the team)
}

export interface Assignment {
  rank: number;
  label: string;
  value?: string;
  memberId: number;
  memberName: string;
}

export interface DrawInfo {
  // weights that were used to pick #1, for transparency in the moderator view
  weights: { memberId: number; memberName: string; weight: number }[];
}

export interface SuggestionSlot {
  slot: number;
  status: 'empty' | 'loading' | 'ready' | 'error';
  token?: string; // changes with every (re)load; late results for an old token are dropped
  sourceId?: string;
  candidate?: RankingCandidate;
  error?: string;
}

export interface Session {
  attendance: number[]; // member ids present today
  slots: SuggestionSlot[];
  discardedIds: string[]; // rerolled suggestions, not suggested again in this daily
  selectedId: string | null;
  selected: RankingCandidate | null;
  assignment: Assignment[] | null;
  drawInfo: DrawInfo | null;
  currentIndex: number; // index into assignment of the current speaker (-1 = not started)
  revealed: boolean;
  runId: number | null; // set once the run has been saved (on reveal)
}

export interface Run {
  id: number;
  createdAt: string;
  dailyDate: string; // YYYY-MM-DD (team time zone)
  rankingId: string;
  title: string;
  source: string;
  assignment: Assignment[];
  firstMemberId: number;
  firstMemberName: string;
}

export interface ModeratorState {
  members: Member[];
  session: Session;
  runsThisWeek: Run[];
  usedRankingCount: number;
  sources: { id: string; name: string }[];
}

export interface ShowState {
  phase: 'idle' | 'drawn' | 'revealed';
  rows: { rank: number; label: string; memberName: string; status: 'done' | 'current' | 'upcoming'; value?: string }[];
  reveal?: { title: string; source: string };
}
