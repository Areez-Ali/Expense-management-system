import type { Budget, Spending } from "../App";

function compareSpendings(a: Spending, b: Spending, newestFirst: boolean): number {
  const direction = newestFirst ? -1 : 1;
  const dateOrder = a.date.localeCompare(b.date) * direction;
  if (dateOrder !== 0) return dateOrder;

  const aTime = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
  const bTime = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;
  const aHasTime = Number.isFinite(aTime);
  const bHasTime = Number.isFinite(bTime);

  if (aHasTime && bHasTime && aTime !== bTime) {
    return (aTime - bTime) * direction;
  }
  if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
  return (a.id - b.id) * direction;
}

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
  return [...spendings].sort((a, b) => compareSpendings(a, b, true));
}

export function sortSpendingsOldestFirst(spendings: Spending[]): Spending[] {
  return [...spendings].sort((a, b) => compareSpendings(a, b, false));
}

type LedgerEvent = {
  date: string;
  timeOfDay: number;
  kind: "budget" | "spending";
  id: number;
  amount: number;
  spendingId?: number;
};

function localDayAndTime(timestamp: string) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const timeOfDay =
    date.getHours() * 60 * 60 * 1000 +
    date.getMinutes() * 60 * 1000 +
    date.getSeconds() * 1000 +
    date.getMilliseconds();
  return { day, timeOfDay };
}

export function isBudgetPeriodConsistent(budget: Budget): boolean {
  const allocationMoment = budget.allocatedAt
    ? localDayAndTime(budget.allocatedAt)
    : null;

  if (!allocationMoment) return false;

  const [year, month] = allocationMoment.day.split("-").map(Number);
  return budget.year === year && budget.month === month;
}

export function doesBudgetAffectMonthBalance(
  budget: Budget,
  month: number,
  year: number,
): boolean {
  const storedPeriod = budget.year * 12 + budget.month - 1;
  const selectedPeriod = year * 12 + month - 1;
  const allocationMoment = budget.allocatedAt
    ? localDayAndTime(budget.allocatedAt)
    : null;

  // With no usable timestamp, the allocation could affect any month from
  // its stored accounting period onward, so keep those balances unavailable.
  if (!allocationMoment) return selectedPeriod >= storedPeriod;

  const [allocationYear, allocationMonth] = allocationMoment.day
    .split("-")
    .map(Number);
  const allocationPeriod = allocationYear * 12 + allocationMonth - 1;

  // Keep the balance unavailable from the first disputed period onward until
  // the row is verified; later totals can still inherit the disputed opening.
  return selectedPeriod >= Math.min(storedPeriod, allocationPeriod);
}

export function calculateMemberTransactionBalances(
  budgets: Budget[],
  spendings: Spending[],
  startingBalance: number,
): Map<number, number | null> {
  const balances = new Map<number, number | null>();
  const hasUncertainBudgetTime = budgets.some(
    (budget) => !isBudgetPeriodConsistent(budget),
  );

  // Missing timestamps and period mismatches make this month's financial
  // event sequence disagree with the accounting period used for summaries.
  if (hasUncertainBudgetTime) {
    spendings.forEach((spending) => balances.set(spending.id, null));
    return balances;
  }

  const events: LedgerEvent[] = [];

  budgets.forEach((budget) => {
    const allocationMoment = localDayAndTime(budget.allocatedAt!);
    if (!allocationMoment) {
      spendings.forEach((spending) => balances.set(spending.id, null));
      return;
    }
    events.push({
      date: allocationMoment.day,
      timeOfDay: allocationMoment.timeOfDay,
      kind: "budget",
      id: budget.id,
      amount: budget.amount,
    });
  });

  const spendingDatesWithUnknownTime = new Set(
    spendings
      .filter((spending) => {
        const timestamp = spending.createdAt
          ? Date.parse(spending.createdAt)
          : Number.NaN;
        return !Number.isFinite(timestamp);
      })
      .map((spending) => spending.date),
  );

  spendings.forEach((spending) => {
    const createdMoment = spending.createdAt
      ? localDayAndTime(spending.createdAt)
      : null;
    events.push({
      // spending_date is the effective transaction day; created_at supplies
      // its time of day so backdated entries remain on their selected date.
      date: spending.date,
      timeOfDay: createdMoment?.timeOfDay ?? 0,
      kind: "spending",
      id: spending.id,
      amount: spending.amount,
      spendingId: spending.id,
    });
  });

  events.sort((a, b) => {
    const dateOrder = a.date.localeCompare(b.date);
    if (dateOrder !== 0) return dateOrder;
    if (a.timeOfDay !== b.timeOfDay) return a.timeOfDay - b.timeOfDay;
    if (a.kind !== b.kind) return a.kind === "budget" ? -1 : 1;
    return a.id - b.id;
  });

  let balance = startingBalance;
  events.forEach((event) => {
    if (event.kind === "budget") {
      balance += event.amount;
    } else if (event.spendingId !== undefined) {
      balance -= event.amount;
      balances.set(
        event.spendingId,
        spendingDatesWithUnknownTime.has(event.date) ? null : balance,
      );
    }
  });

  return balances;
}
