/**
 * Frontend debt-payoff simulator.
 *
 * Mirrors the backend amortization logic (debts.service.ts) so the numbers
 * match, but produces a month-by-month balance series for charting plus an
 * explicit "snowball cascade" trace: when a debt closes, its freed EMI rolls
 * into the next target debt.
 *
 * Two scenarios are simulated:
 *  - baseline    → every debt pays only its minimum, freed money is NOT
 *                  redirected. This is the "natural tenure" (slow).
 *  - accelerated → fixed monthly budget (minimums + extra); as each debt
 *                  closes, its minimum cascades onto the next target (fast).
 */

const YEARLY_RENEWAL = new Set(["OVERDRAFT", "JEWEL_LOAN"]);
const MAX_MONTHS = 600;

export interface SimDebt {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minimumPayment: number;
  type: string;
}

export interface CascadeEvent {
  /** 1-based month index at which this debt is fully paid off. */
  closeMonth: number;
  closedName: string;
  /** The closed debt's own minimum EMI — the amount that gets freed up. */
  freedAmount: number;
  /** Total interest paid on this debt over its life. */
  totalInterest: number;
  /** The next debt the freed money flows into (null for the final debt). */
  targetName: string | null;
  /** Total monthly amount now attacking the target (its min + extra + all freed minimums so far). */
  newTargetEMI: number;
}

export interface SeriesPoint {
  month: number;
  /** Outstanding balance under the accelerated plan (null once paid off, so the line stops). */
  accelerated: number | null;
  /** Outstanding balance paying minimums only (null once paid off). */
  baseline: number | null;
}

export interface PayoffSim {
  months: number;
  baselineMonths: number;
  totalInterest: number;
  baselineInterest: number;
  monthsSaved: number;
  interestSaved: number;
  monthlyBudget: number;
  totalMinimum: number;
  extra: number;
  series: SeriesPoint[];
  cascades: CascadeEvent[];
  /** True if minimum-only payments never clear the debt (negative amortization). */
  baselineNeverPaysOff: boolean;
}

function monthlyInterest(balance: number, apr: number, type: string, month: number): number {
  if (YEARLY_RENEWAL.has(type)) {
    return month % 12 === 0 ? balance * (apr / 100) : 0;
  }
  return balance * (apr / 100 / 12);
}

function orderDebts(debts: SimDebt[], strategy: "avalanche" | "snowball"): SimDebt[] {
  return strategy === "avalanche"
    ? [...debts].sort((a, b) => b.apr - a.apr)
    : [...debts].sort((a, b) => a.balance - b.balance);
}

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

export interface SinglePayoff {
  /** Months to clear the loan at the given monthly payment (capped at MAX_MONTHS). */
  months: number;
  totalInterest: number;
  /** False if the payment never clears the loan (interest ≥ payment). */
  closes: boolean;
}

/**
 * Forward-simulate ONE loan at a fixed monthly payment.
 * Uses the same interest rules as the multi-debt engine (monthly compound,
 * or once-yearly for renewal types) so results stay consistent.
 */
export function singlePayoff(debt: SimDebt, payment: number): SinglePayoff {
  if (payment <= 0) {
    return { months: MAX_MONTHS, totalInterest: Infinity, closes: false };
  }
  let bal = debt.balance;
  let interest = 0;
  let month = 0;
  while (bal > 0 && month < MAX_MONTHS) {
    month++;
    const ic = monthlyInterest(bal, debt.apr, debt.type, month);
    bal += ic;
    interest += ic;
    if (payment >= bal) {
      bal = 0;
      break;
    }
    bal -= payment;
  }
  return {
    months: bal <= 0 ? month : MAX_MONTHS,
    totalInterest: Math.round(interest),
    closes: bal <= 0,
  };
}

/**
 * Reverse solve: the minimal monthly payment that clears `debt` within
 * `targetMonths`. Binary search over the forward simulation, so it works for
 * both normal and yearly-renewal loans. Returns the payment rounded up.
 */
export function requiredPaymentForTenure(debt: SimDebt, targetMonths: number): number {
  if (targetMonths <= 0 || debt.balance <= 0) return 0;
  let lo = 0;
  // Upper bound: enough to clear in a single month (balance + one month interest).
  let hi = debt.balance * (1 + debt.apr / 100) + 1;
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2;
    const res = singlePayoff(debt, mid);
    if (res.closes && res.months <= targetMonths) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi);
}

/**
 * Reverse solve: the minimal *extra* monthly payment (on top of all minimums)
 * needed to clear every debt within `targetMonths`. Binary search over the full
 * payoff simulation. Returns the extra, rounded up.
 */
export function requiredExtraForGoal(
  debts: SimDebt[],
  targetMonths: number,
  strategy: "avalanche" | "snowball",
): number {
  if (debts.length === 0 || targetMonths <= 0) return 0;
  const totalBalance = debts.reduce((s, d) => s + d.balance, 0);
  let lo = 0;
  let hi = totalBalance * 2 + 1; // a huge extra clears almost immediately
  for (let it = 0; it < 48; it++) {
    const mid = (lo + hi) / 2;
    const { months } = simulatePayoff(debts, mid, strategy);
    if (months <= targetMonths) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi);
}

export interface WindfallAllocation {
  id: string;
  name: string;
  applied: number;
  closed: boolean;
  origBalance: number;
  newBalance: number;
  minimumPayment: number;
}

/**
 * Pour a lump sum across debts in strategy order (avalanche = highest APR first,
 * snowball = smallest balance first), fully clearing each before moving on.
 * Returns the per-debt allocation, the reduced debt set (open debts only), and
 * any leftover once everything is cleared.
 */
export function allocateWindfall(
  debts: SimDebt[],
  amount: number,
  strategy: "avalanche" | "snowball",
): { allocations: WindfallAllocation[]; reducedDebts: SimDebt[]; leftover: number } {
  const order = strategy === "avalanche"
    ? [...debts].sort((a, b) => b.apr - a.apr)
    : [...debts].sort((a, b) => a.balance - b.balance);

  let remaining = amount;
  const appliedById = new Map<string, number>();
  const allocations: WindfallAllocation[] = [];
  for (const d of order) {
    const applied = remaining > 0 ? Math.min(remaining, d.balance) : 0;
    if (applied <= 0) continue;
    remaining -= applied;
    appliedById.set(d.id, applied);
    allocations.push({
      id: d.id,
      name: d.name,
      applied: Math.round(applied),
      closed: applied >= d.balance - 0.01,
      origBalance: Math.round(d.balance),
      newBalance: Math.round(d.balance - applied),
      minimumPayment: d.minimumPayment,
    });
  }

  const reducedDebts = debts
    .map((d) => ({ ...d, balance: d.balance - (appliedById.get(d.id) ?? 0) }))
    .filter((d) => d.balance > 0.01);

  return { allocations, reducedDebts, leftover: Math.max(0, Math.round(remaining)) };
}

interface AcceleratedResult {
  months: number;
  totalInterest: number;
  balanceByMonth: number[]; // index 0 = starting total
  closeMonth: number[]; // per sorted-debt
  interestByDebt: number[]; // per sorted-debt
  sorted: SimDebt[];
}

function simulateAccelerated(
  debts: SimDebt[],
  extra: number,
  strategy: "avalanche" | "snowball",
): AcceleratedResult {
  const sorted = orderDebts(debts, strategy);
  const totalMin = sum(sorted.map((d) => d.minimumPayment));
  const budget = totalMin + extra;

  const bal = sorted.map((d) => d.balance);
  const interest = sorted.map(() => 0);
  const closeMonth = sorted.map(() => 0);
  const balanceByMonth: number[] = [sum(bal)];

  let month = 0;
  while (bal.some((b) => b > 0) && month < MAX_MONTHS) {
    month++;
    let remaining = budget;

    // 1) interest + minimum on every open debt
    for (let i = 0; i < sorted.length; i++) {
      if (bal[i]! <= 0) continue;
      const ic = monthlyInterest(bal[i]!, sorted[i]!.apr, sorted[i]!.type, month);
      bal[i]! += ic;
      interest[i]! += ic;
      const pay = Math.min(sorted[i]!.minimumPayment, bal[i]!);
      bal[i] = Math.max(0, bal[i]! - pay);
      remaining -= pay;
      if (bal[i] === 0 && closeMonth[i] === 0) closeMonth[i] = month;
    }

    // 2) throw everything left at the first still-open debt (the target)
    for (let i = 0; i < sorted.length && remaining > 0; i++) {
      if (bal[i]! <= 0) continue;
      const extraPay = Math.min(remaining, bal[i]!);
      bal[i] = Math.max(0, bal[i]! - extraPay);
      remaining -= extraPay;
      if (bal[i] === 0 && closeMonth[i] === 0) closeMonth[i] = month;
    }

    balanceByMonth.push(sum(bal));
  }

  return {
    months: month,
    totalInterest: sum(interest),
    balanceByMonth,
    closeMonth,
    interestByDebt: interest,
    sorted,
  };
}

function simulateBaseline(debts: SimDebt[]): {
  months: number;
  totalInterest: number;
  balanceByMonth: number[];
  neverPaysOff: boolean;
} {
  const bal = debts.map((d) => d.balance);
  const balanceByMonth: number[] = [sum(bal)];
  let interest = 0;
  let month = 0;

  while (bal.some((b) => b > 0) && month < MAX_MONTHS) {
    month++;
    for (let i = 0; i < debts.length; i++) {
      if (bal[i]! <= 0) continue;
      const ic = monthlyInterest(bal[i]!, debts[i]!.apr, debts[i]!.type, month);
      bal[i]! += ic;
      interest += ic;
      const pay = Math.min(debts[i]!.minimumPayment, bal[i]!);
      bal[i] = Math.max(0, bal[i]! - pay);
    }
    balanceByMonth.push(sum(bal));
  }

  return {
    months: month,
    totalInterest: interest,
    balanceByMonth,
    neverPaysOff: bal.some((b) => b > 0),
  };
}

export function simulatePayoff(
  debts: SimDebt[],
  extra: number,
  strategy: "avalanche" | "snowball",
): PayoffSim {
  const totalMinimum = sum(debts.map((d) => d.minimumPayment));
  const monthlyBudget = totalMinimum + extra;

  const acc = simulateAccelerated(debts, extra, strategy);
  const base = simulateBaseline(debts);

  // Merge the two balance series onto a shared month axis.
  const maxLen = Math.max(acc.balanceByMonth.length, base.balanceByMonth.length);
  const series: SeriesPoint[] = [];
  for (let m = 0; m < maxLen; m++) {
    const a = acc.balanceByMonth[m];
    const b = base.balanceByMonth[m];
    series.push({
      month: m,
      accelerated: a === undefined ? 0 : Math.round(a),
      baseline: b === undefined ? 0 : Math.round(b),
    });
  }

  // Build the cascade trace. A debt's freed EMI rolls into whichever debt is
  // *actually still being paid* when it closes — i.e. the highest-priority debt
  // still open at that month. This is NOT always the next debt in APR order: a
  // small low-priority debt can close (via its own minimums) before the
  // high-priority target does, so close-order and priority-order diverge.
  const closeOf = (idx: number): number => acc.closeMonth[idx]! || acc.months;

  // Walk debts in the order they actually close.
  const byClose = acc.sorted
    .map((d, idx) => ({ d, idx, closeMonth: closeOf(idx) }))
    .sort((a, b) => a.closeMonth - b.closeMonth || a.idx - b.idx);

  const cascades: CascadeEvent[] = [];
  let cumulativeFreed = 0;
  for (const ev of byClose) {
    cumulativeFreed += ev.d.minimumPayment;
    // Target = first debt in priority (sorted) order still open *after* this close.
    let targetIdx = -1;
    for (let j = 0; j < acc.sorted.length; j++) {
      if (closeOf(j) > ev.closeMonth) {
        targetIdx = j;
        break;
      }
    }
    const target = targetIdx >= 0 ? acc.sorted[targetIdx]! : null;
    const newTargetEMI = target ? target.minimumPayment + extra + cumulativeFreed : 0;
    cascades.push({
      closeMonth: ev.closeMonth,
      closedName: ev.d.name,
      freedAmount: Math.round(ev.d.minimumPayment),
      totalInterest: Math.round(acc.interestByDebt[ev.idx] ?? 0),
      targetName: target?.name ?? null,
      newTargetEMI: Math.round(newTargetEMI),
    });
  }

  return {
    months: acc.months,
    baselineMonths: base.months,
    totalInterest: Math.round(acc.totalInterest),
    baselineInterest: Math.round(base.totalInterest),
    monthsSaved: Math.max(0, base.months - acc.months),
    interestSaved: Math.max(0, Math.round(base.totalInterest - acc.totalInterest)),
    monthlyBudget: Math.round(monthlyBudget),
    totalMinimum: Math.round(totalMinimum),
    extra,
    series,
    cascades,
    baselineNeverPaysOff: base.neverPaysOff,
  };
}
