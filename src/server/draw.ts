// Drawing the speaking order.
//
// Rules:
//  - Members with the same group (e.g. "FE", "BE") form a block and always speak back-to-back.
//    Members without a group are single-person blocks.
//  - #1 is drawn weighted from ALL present members (see fairness.ts for the weights).
//    That member's block goes first, with that member at the front of it.
//  - The remaining blocks, and the order inside each remaining block, are shuffled uniformly.
//  - The resulting order of people is mapped onto ranking entries 1..N.

import type { Assignment, RankingEntry } from '../shared/types.js';

export type Rng = () => number; // uniform in [0, 1)

export interface DrawPerson {
  id: number;
  name: string;
  group: string | null;
}

/** Groups people into blocks. Group names are compared case-insensitively and trimmed. */
export function buildBlocks(people: DrawPerson[]): DrawPerson[][] {
  const byGroup = new Map<string, DrawPerson[]>();
  const blocks: DrawPerson[][] = [];
  for (const p of people) {
    const key = p.group?.trim().toLowerCase();
    if (!key) {
      blocks.push([p]);
      continue;
    }
    let block = byGroup.get(key);
    if (!block) {
      block = [];
      byGroup.set(key, block);
      blocks.push(block);
    }
    block.push(p);
  }
  return blocks;
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Picks one item with probability proportional to its weight. Weights must be > 0. */
export function weightedPick<T>(items: T[], weightOf: (item: T) => number, rng: Rng): T {
  const total = items.reduce((sum, it) => sum + weightOf(it), 0);
  let r = rng() * total;
  for (const it of items) {
    r -= weightOf(it);
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

/** Returns the speaking order of the given people. */
export function drawOrder(people: DrawPerson[], weightOf: (p: DrawPerson) => number, rng: Rng): DrawPerson[] {
  if (people.length === 0) return [];
  const first = weightedPick(people, weightOf, rng);
  const blocks = buildBlocks(people);
  const firstBlock = blocks.find((b) => b.includes(first))!;
  const others = shuffle(
    blocks.filter((b) => b !== firstBlock),
    rng,
  ).map((b) => shuffle(b, rng));
  const head = [first, ...shuffle(firstBlock.filter((p) => p !== first), rng)];
  return [head, ...others].flat();
}

/** Maps the speaking order onto the first N ranking entries. */
export function assign(order: DrawPerson[], entries: RankingEntry[]): Assignment[] {
  if (entries.length < order.length) {
    throw new Error(`Ranking has only ${entries.length} entries, but ${order.length} people are present`);
  }
  return order.map((p, i) => ({
    rank: i + 1,
    label: entries[i].label,
    value: entries[i].value,
    memberId: p.id,
    memberName: p.name,
  }));
}
