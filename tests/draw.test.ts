import { describe, expect, it } from 'vitest';
import { assign, buildBlocks, drawOrder, type DrawPerson } from '../src/server/draw.js';
import { startWeights } from '../src/server/fairness.js';
import { seeded } from './helpers.js';

const team: DrawPerson[] = [
  { id: 1, name: 'Fe1', group: 'FE' },
  { id: 2, name: 'Fe2', group: 'FE' },
  { id: 3, name: 'Be1', group: 'BE' },
  { id: 4, name: 'Be2', group: 'be ' }, // case and whitespace are ignored
  { id: 5, name: 'Lead', group: null },
];
const uniform = () => 1;
const groupOf = (p: DrawPerson) => p.group?.trim().toLowerCase() ?? null;

function isBlockConsistent(order: DrawPerson[]): boolean {
  // every group must occupy consecutive positions
  const seen = new Set<string>();
  let prev: string | null = null;
  for (const p of order) {
    const g = groupOf(p);
    if (g && g !== prev && seen.has(g)) return false;
    if (g) seen.add(g);
    prev = g;
  }
  return true;
}

describe('buildBlocks', () => {
  it('groups by group name and keeps ungrouped people single', () => {
    const blocks = buildBlocks(team);
    expect(blocks.map((b) => b.map((p) => p.id))).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('drawOrder', () => {
  it('never splits a group, places the lead only on 1, 3 or 5, and produces all 24 orders', () => {
    const rng = seeded(42);
    const orders = new Set<string>();
    const leadPositions = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const order = drawOrder(team, uniform, rng);
      expect(order).toHaveLength(5);
      expect(new Set(order.map((p) => p.id)).size).toBe(5);
      expect(isBlockConsistent(order)).toBe(true);
      leadPositions.add(order.findIndex((p) => p.id === 5) + 1);
      orders.add(order.map((p) => p.id).join(''));
    }
    expect([...leadPositions].sort()).toEqual([1, 3, 5]);
    expect(orders.size).toBe(24);
  });

  it('gives every person the same chance for #1 with equal weights (not every block)', () => {
    const rng = seeded(7);
    const firsts = new Map<number, number>();
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const id = drawOrder(team, uniform, rng)[0].id;
      firsts.set(id, (firsts.get(id) ?? 0) + 1);
    }
    for (const p of team) expect(firsts.get(p.id)! / n).toBeCloseTo(0.2, 1);
  });

  it('picks #1 proportional to the weights', () => {
    const rng = seeded(3);
    const weights = new Map([
      [1, 1],
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 4],
    ]);
    const firsts = new Map<number, number>();
    const n = 40000;
    for (let i = 0; i < n; i++) {
      const id = drawOrder(team, (p) => weights.get(p.id)!, rng)[0].id;
      firsts.set(id, (firsts.get(id) ?? 0) + 1);
    }
    expect(firsts.get(1)! / n).toBeCloseTo(1 / 20, 2);
    expect(firsts.get(2)! / n).toBeCloseTo(5 / 20, 1);
    expect(firsts.get(5)! / n).toBeCloseTo(4 / 20, 1);
  });

  it('puts the partner of the #1 person directly on #2', () => {
    const rng = seeded(11);
    for (let i = 0; i < 500; i++) {
      const order = drawOrder(team, uniform, rng);
      const g = groupOf(order[0]);
      if (g) expect(groupOf(order[1])).toBe(g);
    }
  });

  it('treats a group member whose partner is absent as a single block', () => {
    const present = team.filter((p) => p.id !== 2); // Fe2 absent
    const rng = seeded(5);
    const positions = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      const order = drawOrder(present, uniform, rng);
      expect(isBlockConsistent(order)).toBe(true);
      positions.add(order.findIndex((p) => p.id === 1) + 1);
    }
    // blocks: [Fe1], [Be1, Be2], [Lead] -> Fe1 can be 1, 2, 3 or 4 but never between the BEs
    expect([...positions].sort()).toEqual([1, 2, 3, 4]);
  });

  it('handles larger groups and single people', () => {
    expect(drawOrder([], uniform, seeded(1))).toEqual([]);
    const one = [{ id: 9, name: 'Solo', group: 'QA' }];
    expect(drawOrder(one, uniform, seeded(1))).toEqual(one);
    const big = [...team, { id: 6, name: 'Be3', group: 'BE' }];
    const rng = seeded(9);
    for (let i = 0; i < 500; i++) expect(isBlockConsistent(drawOrder(big, uniform, rng))).toBe(true);
  });
});

describe('assign', () => {
  const entries = Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, label: `E${i + 1}`, value: String(100 - i) }));

  it('maps the order onto ranks 1..N without gaps', () => {
    const a = assign(team, entries);
    expect(a.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(a.map((x) => x.label)).toEqual(['E1', 'E2', 'E3', 'E4', 'E5']);
    expect(a[0]).toMatchObject({ memberId: 1, memberName: 'Fe1', value: '100' });
  });

  it('refuses rankings with fewer entries than people', () => {
    expect(() => assign(team, entries.slice(0, 4))).toThrow(/only 4 entries/);
  });
});

describe('startWeights', () => {
  const t = (day: number) => `2026-11-${String(day).padStart(2, '0')}T08:30:00Z`;

  it('gives the maximum to everybody who has not started this week', () => {
    const w = startWeights([1, 2, 3], [], 5);
    expect([...w.values()]).toEqual([5, 5, 5]);
  });

  it('counts dailies since the last start (current daily = 1), capped', () => {
    const runs = [
      { firstMemberId: 1, createdAt: t(23) }, // Mon
      { firstMemberId: 2, createdAt: t(24) }, // Tue
      { firstMemberId: 3, createdAt: t(25) }, // Wed
      { firstMemberId: 1, createdAt: t(26) }, // Thu
    ];
    const w = startWeights([1, 2, 3, 4], runs, 5);
    expect(w.get(1)).toBe(1); // started yesterday
    expect(w.get(3)).toBe(2);
    expect(w.get(2)).toBe(3);
    expect(w.get(4)).toBe(5); // not this week
    const capped = startWeights([2], runs, 2);
    expect(capped.get(2)).toBe(2);
  });
});
