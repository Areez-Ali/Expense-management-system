import type { Budget, Spending } from "../App";

export function sortBudgetsNewestFirst(budgets: Budget[]): Budget[] {
  return [...budgets].sort((a, b) => {
    const aTime = a.allocatedAt ? Date.parse(a.allocatedAt) : Number.NaN;
    const bTime = b.allocatedAt ? Date.parse(b.allocatedAt) : Number.NaN;
    const aHasTime = Number.isFinite(aTime);
    const bHasTime = Number.isFinite(bTime);

    if (aHasTime && bHasTime && aTime !== bTime) return bTime - aTime;
    if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
    return b.id - a.id;
  });
}

export function sortSpendingsNewestFirst(spendings: Spending[]): Spending[] {
  return [...spendings].sort((a, b) => {
    const dateOrder = b.date.localeCompare(a.date);
    if (dateOrder !== 0) return dateOrder;

    const aTime = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;
    const aHasTime = Number.isFinite(aTime);
    const bHasTime = Number.isFinite(bTime);

    if (aHasTime && bHasTime && aTime !== bTime) return bTime - aTime;
    if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
    return b.id - a.id;
  });
}
