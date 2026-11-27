// Soft fairness for #1, based on the runs of the current week only.
//
// weight = number of dailies since the member last started (the current daily counts as 1),
//          capped at maxWeight. A member who has not started this week gets maxWeight.
// Example with maxWeight 5: started yesterday -> 1, started three dailies ago -> 3, not this week -> 5.

export interface RunLike {
  firstMemberId: number;
  createdAt: string | Date;
}

export function startWeights(memberIds: number[], runsThisWeek: RunLike[], maxWeight: number): Map<number, number> {
  // newest first
  const runs = [...runsThisWeek].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const weights = new Map<number, number>();
  for (const id of memberIds) {
    const idx = runs.findIndex((r) => r.firstMemberId === id);
    weights.set(id, idx === -1 ? maxWeight : Math.min(idx + 1, maxWeight));
  }
  return weights;
}
