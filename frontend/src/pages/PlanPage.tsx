import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, addMonths } from "date-fns";
import {
  CalendarClock, Shield, Activity, Target, AlertTriangle, CheckCircle2,
  ArrowDownLeft, ArrowUpRight, TrendingDown, Wallet, Banknote, Sparkles,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { debtsApi } from "@/api/debts";
import { moneyApi } from "@/api/money";
import { usePersistentNumber } from "@/hooks/usePersistentNumber";
import { fmt } from "@/lib/format";
import { simulatePayoff, requiredExtraForGoal, allocateWindfall, type SimDebt } from "@/lib/payoff";
import type { Debt, Income } from "@/types";

// ─── shared helpers ───────────────────────────────────────────────────────

function durationLabel(m: number): string {
  const y = Math.floor(m / 12);
  const mo = m % 12;
  if (y > 0 && mo > 0) return `${y}y ${mo}m`;
  if (y > 0) return `${y}y`;
  return `${mo}m`;
}

function monthLabel(m: number): string {
  const now = new Date();
  return format(new Date(now.getFullYear(), now.getMonth() + m, 1), "MMM yyyy");
}

function toSim(d: Debt): SimDebt {
  return {
    id: d.id,
    name: d.name,
    balance: d.balance,
    apr: d.apr,
    minimumPayment: d.minimumPayment,
    type: d.type,
  };
}

// ─── 1. Cash-flow calendar ────────────────────────────────────────────────

interface FlowEvent {
  date: Date;
  label: string;
  amount: number; // +income, -emi
  kind: "income" | "emi";
}

function projectEvents(incomes: Income[], debts: Debt[], windowDays: number): FlowEvent[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = addDays(today, windowDays);
  const events: FlowEvent[] = [];

  const push = (date: Date, label: string, amount: number, kind: FlowEvent["kind"]) => {
    if (date >= today && date <= end) events.push({ date, label, amount, kind });
  };

  for (const inc of incomes) {
    const start = new Date(inc.date);
    if (inc.frequency === "ONE_TIME") {
      push(start, inc.source, inc.amount, "income");
    } else if (inc.frequency === "WEEKLY" || inc.frequency === "BIWEEKLY") {
      const step = inc.frequency === "WEEKLY" ? 7 : 14;
      let d = new Date(start);
      while (d < today) d = addDays(d, step);
      while (d <= end) {
        push(d, inc.source, inc.amount, "income");
        d = addDays(d, step);
      }
    } else if (inc.frequency === "ANNUAL") {
      let d = new Date(today.getFullYear(), start.getMonth(), start.getDate());
      if (d < today) d = addMonths(d, 12);
      push(d, inc.source, inc.amount, "income");
    } else {
      // MONTHLY (default)
      const day = start.getDate();
      let d = new Date(today.getFullYear(), today.getMonth(), day);
      if (d < today) d = addMonths(d, 1);
      while (d <= end) {
        push(d, inc.source, inc.amount, "income");
        d = addMonths(d, 1);
      }
    }
  }

  for (const debt of debts) {
    if (debt.isPaidOff || debt.minimumPayment <= 0) continue;
    const day = Math.min(Math.max(debt.dueDate || 1, 1), 28);
    let d = new Date(today.getFullYear(), today.getMonth(), day);
    if (d < today) d = addMonths(d, 1);
    while (d <= end) {
      push(d, debt.name, -debt.minimumPayment, "emi");
      d = addMonths(d, 1);
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events;
}

function CashFlowSection({ debts, incomes, currency, userId }: {
  debts: Debt[];
  incomes: Income[];
  currency: string;
  userId: string;
}) {
  const WINDOW = 60;
  const [cash, setCash] = usePersistentNumber(`harmony:cash:${userId}`, 0);

  const events = useMemo(() => projectEvents(incomes, debts, WINDOW), [incomes, debts]);

  // running balance + lowest point
  let running = cash;
  let lowest = cash;
  let lowestDate: Date | null = null;
  const rows = events.map((e) => {
    running += e.amount;
    if (running < lowest) {
      lowest = running;
      lowestDate = e.date;
    }
    return { ...e, balance: running };
  });
  const tightDays = rows.filter((r) => r.balance < 0).length;

  return (
    <div className="space-y-4">
      <div className="card">
        <label className="label">Money in hand right now</label>
        <input
          type="number"
          className="input"
          value={cash || ""}
          onChange={(e) => setCash(Number(e.target.value))}
          placeholder="e.g. 25000"
        />
        <p className="text-[11px] text-fg-muted mt-2">
          We project your income and EMIs over the next {WINDOW} days from here.
        </p>
      </div>

      {/* Lowest point summary */}
      <div className={`card ${lowest < 0 ? "border-coral-300" : "border-sage-300"}`}>
        <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Lowest projected balance</p>
        <div className="flex items-baseline gap-2">
          <span className={`number text-2xl font-semibold ${lowest < 0 ? "text-coral-600" : "text-sage-700"}`}>
            {fmt(lowest, currency)}
          </span>
          {lowestDate && <span className="text-sm text-fg-muted">on {format(lowestDate, "d MMM")}</span>}
        </div>
        {lowest < 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-coral-600 mt-2">
            <AlertTriangle size={13} /> You dip below zero on {tightDays} day{tightDays === 1 ? "" : "s"} — plan ahead.
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-sage-700 mt-2">
            <CheckCircle2 size={13} /> You stay above zero the whole window.
          </p>
        )}
      </div>

      {/* Event timeline */}
      <div className="card">
        <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">Next {WINDOW} days</p>
        {rows.length === 0 ? (
          <p className="text-sm text-fg-muted">No income or EMIs recorded yet to project.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  r.kind === "income" ? "bg-sage-100" : "bg-coral-50"
                }`}>
                  {r.kind === "income"
                    ? <ArrowDownLeft size={14} className="text-sage-600" />
                    : <ArrowUpRight size={14} className="text-coral-600" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg truncate">{r.label}</p>
                  <p className="text-[11px] text-fg-muted">{format(r.date, "EEE d MMM")}</p>
                </div>
                <span className={`number text-sm font-medium flex-shrink-0 ${r.kind === "income" ? "text-sage-700" : "text-fg"}`}>
                  {r.amount > 0 ? "+" : ""}{fmt(r.amount, currency)}
                </span>
                <span className={`number text-xs w-20 text-right flex-shrink-0 ${r.balance < 0 ? "text-coral-600 font-semibold" : "text-fg-muted"}`}>
                  {fmt(r.balance, currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 2. Emergency buffer ──────────────────────────────────────────────────

function SafetyNetSection({ monthlyExpenses, currency, userId }: {
  monthlyExpenses: number;
  currency: string;
  userId: string;
}) {
  const [fund, setFund] = usePersistentNumber(`harmony:buffer:${userId}`, 0);
  const [targetMonths, setTargetMonths] = usePersistentNumber(`harmony:bufferTarget:${userId}`, 3);

  const essentials = monthlyExpenses > 0 ? monthlyExpenses : 0;
  const target = essentials * targetMonths;
  const monthsCovered = essentials > 0 ? fund / essentials : 0;
  const progress = target > 0 ? Math.min(fund / target, 1) : 0;
  const gap = Math.max(0, target - fund);

  // progress ring geometry
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <div className="space-y-4">
      <div className="card flex flex-col items-center">
        <div className="relative w-32 h-32">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-border-strong)" strokeWidth="10" />
            <circle
              cx="60" cy="60" r={R} fill="none"
              stroke={progress >= 1 ? "#10B981" : "#F59E0B"}
              strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="number text-2xl font-semibold text-fg">{Math.round(progress * 100)}%</span>
            <span className="text-[11px] text-fg-muted">funded</span>
          </div>
        </div>
        <p className="number text-sm text-fg-muted mt-3">
          {fmt(fund, currency)} of {fmt(target, currency)}
        </p>
        <p className="text-xs text-sage-700 mt-1">
          Covers <span className="number font-semibold">{monthsCovered.toFixed(1)}</span> month{monthsCovered === 1 ? "" : "s"} of expenses
        </p>
      </div>

      <div className="card space-y-3">
        <div>
          <label className="label">Current emergency savings</label>
          <input
            type="number"
            className="input"
            value={fund || ""}
            onChange={(e) => setFund(Number(e.target.value))}
            placeholder="e.g. 50000"
          />
        </div>
        <div>
          <label className="label">Target cushion</label>
          <div className="flex gap-2">
            {[3, 6].map((m) => (
              <button
                key={m}
                onClick={() => setTargetMonths(m)}
                className={`flex-1 text-sm py-2 rounded-xl border font-medium transition-all ${
                  targetMonths === m
                    ? "bg-sage-600 text-white border-sage-600"
                    : "border-border text-fg-muted hover:border-sage-300"
                }`}
              >
                {m} months
              </button>
            ))}
          </div>
        </div>
        <p className="number text-xs text-fg-muted">
          Based on {fmt(essentials, currency)}/mo expenses.
          {gap > 0 && <> Still need <span className="text-fg font-medium">{fmt(gap, currency)}</span>.</>}
        </p>
      </div>

      {monthsCovered < 1 && essentials > 0 && (
        <div className="card border-clay-300 flex items-start gap-3">
          <Shield size={18} className="text-clay-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-fg-muted leading-relaxed">
            Common guidance is to keep at least 1 month of expenses set aside before paying debt aggressively —
            so a surprise bill doesn't force you back into borrowing. You're at{" "}
            <span className="number font-medium text-fg">{monthsCovered.toFixed(1)}</span> right now.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 3. Stress test ───────────────────────────────────────────────────────

function StressSlider({ label, value, set, min, max, step, fmtVal }: {
  label: string; value: number; set: (n: number) => void;
  min: number; max: number; step: number; fmtVal: (n: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs text-fg-muted">{label}</span>
        <span className="number text-sm font-semibold text-clay-600">{fmtVal(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="w-full h-1.5 appearance-none rounded-full outline-none cursor-pointer"
        style={{ background: `linear-gradient(to right, #F59E0B ${pct}%, var(--color-border) ${pct}%)` }}
      />
    </div>
  );
}

function StressTestSection({ debts, currency }: { debts: Debt[]; currency: string }) {
  const [incomeDrop, setIncomeDrop] = useState(0); // %
  const [rateHike, setRateHike] = useState(0); // absolute APR points
  const [shock, setShock] = useState(0); // one-time expense

  const sims = useMemo(() => toSimList(debts), [debts]);
  const totalMin = sims.reduce((s, d) => s + d.minimumPayment, 0);
  const baseExtra = Math.round(totalMin * 0.2);

  const baseline = useMemo(() => simulatePayoff(sims, baseExtra, "avalanche"), [sims, baseExtra]);

  const stressed = useMemo(() => {
    // income drop shrinks capacity (minimums + extra), so extra falls first
    const capacity = totalMin + baseExtra;
    const newCapacity = capacity * (1 - incomeDrop / 100);
    const newExtra = Math.max(0, newCapacity - totalMin);
    // rate hike on every debt; shock added to highest-APR debt's balance
    const hiked = sims.map((d) => ({ ...d, apr: d.apr + rateHike }));
    if (shock > 0 && hiked.length) {
      const idx = hiked.reduce((best, d, i, arr) => (d.apr > arr[best]!.apr ? i : best), 0);
      hiked[idx] = { ...hiked[idx]!, balance: hiked[idx]!.balance + shock };
    }
    return { sim: simulatePayoff(hiked, newExtra, "avalanche"), newExtra, cantCoverMin: newCapacity < totalMin };
  }, [sims, totalMin, baseExtra, incomeDrop, rateHike, shock]);

  const monthsDelta = stressed.sim.months - baseline.months;
  const interestDelta = stressed.sim.totalInterest - baseline.totalInterest;

  return (
    <div className="space-y-4">
      <div className="card flex items-start gap-3">
        <Activity size={18} className="text-clay-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-fg-muted leading-relaxed">
          See how your payoff plan holds up if life throws a curveball. Drag the levers below.
        </p>
      </div>

      <div className="card space-y-5">
        <StressSlider label="Income drops by" value={incomeDrop} set={setIncomeDrop} min={0} max={60} step={5} fmtVal={(n) => `${n}%`} />
        <StressSlider label="Interest rates rise by" value={rateHike} set={setRateHike} min={0} max={6} step={0.5} fmtVal={(n) => `+${n}%`} />
        <StressSlider label="Surprise expense" value={shock} set={setShock} min={0} max={200000} step={5000} fmtVal={(n) => fmt(n, currency)} />
      </div>

      {stressed.cantCoverMin && (
        <div className="card border-coral-300 flex items-start gap-3">
          <AlertTriangle size={18} className="text-coral-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-coral-600 leading-relaxed">
            At this income level you can't cover the minimum EMIs ({fmt(totalMin, currency)}/mo). This is the scenario to
            build a buffer for.
          </p>
        </div>
      )}

      {/* Before / after */}
      <div className="card">
        <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">Plan impact</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] text-fg-muted mb-0.5">Debt-free</p>
            <p className="number text-sm text-fg-muted line-through">{durationLabel(baseline.months)}</p>
            <p className="number text-lg font-semibold text-fg">{durationLabel(stressed.sim.months)}</p>
            {monthsDelta > 0 && (
              <p className="text-[11px] text-coral-600 mt-0.5">+{durationLabel(monthsDelta)} longer</p>
            )}
          </div>
          <div>
            <p className="text-[11px] text-fg-muted mb-0.5">Total interest</p>
            <p className="number text-sm text-fg-muted line-through">{fmt(baseline.totalInterest, currency)}</p>
            <p className="number text-lg font-semibold text-fg">{fmt(stressed.sim.totalInterest, currency)}</p>
            {interestDelta > 0 && (
              <p className="number text-[11px] text-coral-600 mt-0.5">+{fmt(interestDelta, currency)} more</p>
            )}
          </div>
        </div>
        {monthsDelta <= 0 && interestDelta <= 0 && (
          <p className="flex items-center gap-1.5 text-xs text-sage-700 mt-3 pt-3 border-t border-border">
            <CheckCircle2 size={13} /> Your plan absorbs this scenario without slipping.
          </p>
        )}
      </div>
    </div>
  );
}

function toSimList(debts: Debt[]): SimDebt[] {
  return debts.map(toSim);
}

// ─── 4. Goal back-solver ──────────────────────────────────────────────────

function GoalSection({ debts, currency, userId }: { debts: Debt[]; currency: string; userId: string }) {
  const sims = useMemo(() => toSimList(debts), [debts]);
  const totalMin = sims.reduce((s, d) => s + d.minimumPayment, 0);
  const natural = useMemo(() => simulatePayoff(sims, 0, "avalanche"), [sims]);
  const naturalMonths = natural.months;

  const [target, setTarget] = useState<number>(() => Math.max(3, Math.round(naturalMonths / 2)));
  const [currentExtra, setCurrentExtra] = usePersistentNumber(`harmony:currentExtra:${userId}`, 0);

  const clamped = Math.min(Math.max(target, 1), Math.max(naturalMonths, 1));
  const requiredExtra = useMemo(
    () => requiredExtraForGoal(sims, clamped, "avalanche"),
    [sims, clamped],
  );
  const requiredMonthly = totalMin + requiredExtra;
  const onTrack = currentExtra >= requiredExtra;
  const gap = Math.max(0, requiredExtra - currentExtra);

  const pct = ((clamped - 1) / Math.max(naturalMonths - 1, 1)) * 100;

  return (
    <div className="space-y-4">
      <div className="card flex items-start gap-3">
        <Target size={18} className="text-sage-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-fg-muted leading-relaxed">
          Pick when you want to be debt-free. We'll back-solve the monthly payment it takes.
        </p>
      </div>

      <div className="card">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs text-fg-muted">Debt-free in</span>
          <span className="number text-base font-semibold text-sage-700">
            {durationLabel(clamped)} · {monthLabel(clamped)}
          </span>
        </div>
        <input
          type="range" min={1} max={Math.max(naturalMonths, 1)} step={1} value={clamped}
          onChange={(e) => setTarget(Number(e.target.value))}
          className="w-full h-1.5 appearance-none rounded-full outline-none cursor-pointer"
          style={{ background: `linear-gradient(to right, #F59E0B ${pct}%, var(--color-border) ${pct}%)` }}
        />
        <p className="text-[11px] text-fg-muted mt-2">
          At minimums only you'd be free in {durationLabel(naturalMonths)}.
        </p>
      </div>

      <div className="card border-sage-300">
        <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Required monthly</p>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="number text-3xl font-semibold text-sage-700">{fmt(requiredMonthly, currency)}</span>
          <span className="text-sm text-fg-muted">/mo</span>
        </div>
        <p className="number text-xs text-fg-muted">
          {fmt(totalMin, currency)} minimums + {fmt(requiredExtra, currency)} extra
        </p>
      </div>

      <div className="card space-y-3">
        <div>
          <label className="label">Extra you pay today (per month)</label>
          <input
            type="number"
            className="input"
            value={currentExtra || ""}
            onChange={(e) => setCurrentExtra(Number(e.target.value))}
            placeholder="e.g. 5000"
          />
        </div>
        {onTrack ? (
          <div className="flex items-center gap-2 text-sm text-sage-700">
            <CheckCircle2 size={16} /> On track — you're already paying enough to hit this date.
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-clay-600">
            <TrendingDown size={16} />
            <span>
              Behind by <span className="number font-semibold">{fmt(gap, currency)}/mo</span> to hit this date.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 5. Windfall allocator ────────────────────────────────────────────────

const WINDFALL_PRESETS = [25000, 50000, 100000, 200000, 500000];

function WindfallSection({ debts, currency, userId }: { debts: Debt[]; currency: string; userId: string }) {
  const [amount, setAmount] = usePersistentNumber(`harmony:windfall:${userId}`, 50000);
  const [strategy, setStrategy] = useState<"avalanche" | "snowball">("avalanche");

  const sims = useMemo(() => toSimList(debts), [debts]);
  const totalMin = sims.reduce((s, d) => s + d.minimumPayment, 0);
  const baseExtra = Math.round(totalMin * 0.2);
  const budget = totalMin + baseExtra;

  const baseline = useMemo(() => simulatePayoff(sims, baseExtra, strategy), [sims, baseExtra, strategy]);

  const { allocations, reducedDebts, leftover } = useMemo(
    () => allocateWindfall(sims, amount, strategy),
    [sims, amount, strategy],
  );

  const withLump = useMemo(() => {
    if (reducedDebts.length === 0) return null; // everything cleared
    const reducedMin = reducedDebts.reduce((s, d) => s + d.minimumPayment, 0);
    const extraForReduced = Math.max(baseExtra, budget - reducedMin); // hold total monthly constant
    return simulatePayoff(reducedDebts, extraForReduced, strategy);
  }, [reducedDebts, budget, baseExtra, strategy]);

  const clearedAll = reducedDebts.length === 0 && sims.length > 0;
  const monthsSaved = withLump ? Math.max(0, baseline.months - withLump.months) : baseline.months;
  const interestSaved = withLump ? Math.max(0, baseline.totalInterest - withLump.totalInterest) : baseline.totalInterest;
  const closed = allocations.filter((a) => a.closed);
  const freedEMI = closed.reduce((s, a) => s + a.minimumPayment, 0);
  const newFreeMonths = withLump ? withLump.months : 0;

  return (
    <div className="space-y-4">
      <div className="card flex items-start gap-3">
        <Banknote size={18} className="text-sage-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-fg-muted leading-relaxed">
          Got a bonus, tax refund, or any lump sum? See exactly where to put it and how much sooner you'd be free —
          while keeping your monthly outlay the same.
        </p>
      </div>

      {/* Amount + strategy */}
      <div className="card space-y-4">
        <div>
          <label className="label">Lump sum amount</label>
          <input
            type="number"
            className="input"
            value={amount || ""}
            onChange={(e) => setAmount(Number(e.target.value))}
            placeholder="e.g. 100000"
          />
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {WINDFALL_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p)}
                className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                  amount === p
                    ? "bg-sage-600 text-white border-sage-600 font-semibold"
                    : "border-border text-fg-muted hover:border-sage-300 hover:text-sage-700"
                }`}
              >
                {fmt(p, currency)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Apply it by</label>
          <div className="flex rounded-lg bg-bg p-0.5 text-xs">
            {(["avalanche", "snowball"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setStrategy(m)}
                className={`flex-1 px-3 py-1.5 rounded-md font-medium transition-all duration-200 ${
                  strategy === m ? "bg-surface text-sage-700 shadow-sm" : "text-fg-muted"
                }`}
              >
                {m === "avalanche" ? "Highest rate first" : "Smallest loan first"}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-fg-muted mt-2">
            {strategy === "avalanche"
              ? "Targets the priciest interest — saves the most money."
              : "Closes whole loans fastest — frees up EMIs and motivation."}
          </p>
        </div>
      </div>

      {/* Impact */}
      <div className="card border-sage-300">
        <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">What it does to your journey</p>
        {clearedAll ? (
          <div className="flex items-start gap-2">
            <Sparkles size={18} className="text-sage-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-sage-700 font-medium">
              This clears <span className="font-semibold">all</span> your debt — you'd be debt-free instantly!
              {leftover > 0 && <> {fmt(leftover, currency)} left over for your safety net.</>}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] text-fg-muted mb-0.5">Debt-free</p>
                <p className="number text-sm text-fg-muted line-through">{durationLabel(baseline.months)}</p>
                <p className="number text-lg font-semibold text-sage-700">{durationLabel(newFreeMonths)}</p>
                {monthsSaved > 0 && <p className="text-[11px] text-sage-700 mt-0.5">{durationLabel(monthsSaved)} sooner</p>}
              </div>
              <div>
                <p className="text-[11px] text-fg-muted mb-0.5">Interest saved</p>
                <p className="number text-lg font-semibold text-sage-700 mt-5">{fmt(interestSaved, currency)}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-xs flex-wrap">
              <span className="text-fg-muted">Free by <span className="font-medium text-fg">{monthLabel(newFreeMonths)}</span></span>
              {freedEMI > 0 && (
                <span className="flex items-center gap-1 text-sage-700">
                  <TrendingDown size={12} /> {fmt(freedEMI, currency)}/mo of EMIs freed
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Allocation breakdown */}
      <div className="card">
        <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">Where it goes</p>
        {allocations.length === 0 ? (
          <p className="text-sm text-fg-muted">Enter a lump sum to see the allocation.</p>
        ) : (
          <div className="space-y-3">
            {allocations.map((a) => {
              const paidPct = a.origBalance > 0 ? (a.applied / a.origBalance) * 100 : 0;
              return (
                <div key={a.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-fg flex items-center gap-1.5">
                      {a.name}
                      {a.closed && (
                        <span className="text-[10px] font-semibold text-sage-700 bg-sage-100 px-1.5 py-0.5 rounded">
                          CLOSED
                        </span>
                      )}
                    </span>
                    <span className="number text-sm font-medium text-sage-700">{fmt(a.applied, currency)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-border overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${a.closed ? "bg-sage-600" : "bg-clay-600"}`}
                      style={{ width: `${paidPct}%` }}
                    />
                  </div>
                  {!a.closed && (
                    <p className="number text-[11px] text-fg-muted mt-1">
                      {fmt(a.origBalance, currency)} → {fmt(a.newBalance, currency)} remaining
                    </p>
                  )}
                </div>
              );
            })}
            {leftover > 0 && !clearedAll && (
              <p className="number text-[11px] text-fg-muted pt-1">
                {fmt(leftover, currency)} left over.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────

const TABS = [
  { key: "cashflow", label: "Cash flow", icon: CalendarClock },
  { key: "safety", label: "Safety net", icon: Shield },
  { key: "windfall", label: "Windfall", icon: Banknote },
  { key: "stress", label: "Stress test", icon: Activity },
  { key: "goal", label: "Goal", icon: Target },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function PlanPage() {
  const user = useAuthStore((s) => s.user);
  const currency = user?.currency ?? "INR";
  const userId = user?.id ?? "anon";
  const [tab, setTab] = useState<TabKey>("cashflow");

  const now = new Date();
  const { data: debts } = useQuery({ queryKey: ["debts"], queryFn: debtsApi.list });
  const { data: incomes } = useQuery({ queryKey: ["income"], queryFn: moneyApi.getIncome });
  const { data: summary } = useQuery({
    queryKey: ["money-summary"],
    queryFn: () => moneyApi.summary(now.getMonth() + 1, now.getFullYear()),
  });

  const activeDebts = (debts ?? []).filter((d) => !d.isPaidOff);
  const monthlyExpenses = summary?.totalSpend ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="heading-serif text-2xl text-fg tracking-tight">Plan</h1>
        <p className="text-sm text-fg-muted mt-0.5">Stay ahead of surprises and on track to your goal.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              tab === key ? "bg-sage-100 text-sage-700" : "text-fg-muted hover:text-fg"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "cashflow" && (
        <CashFlowSection debts={activeDebts} incomes={incomes ?? []} currency={currency} userId={userId} />
      )}
      {tab === "safety" && (
        <SafetyNetSection monthlyExpenses={monthlyExpenses} currency={currency} userId={userId} />
      )}
      {tab === "windfall" &&
        (activeDebts.length > 0 ? (
          <WindfallSection debts={activeDebts} currency={currency} userId={userId} />
        ) : (
          <EmptyHint icon={<Banknote size={32} className="text-fg-soft" />} text="Add a debt to plan a lump sum." />
        ))}
      {tab === "stress" &&
        (activeDebts.length > 0 ? (
          <StressTestSection debts={activeDebts} currency={currency} />
        ) : (
          <EmptyHint icon={<Activity size={32} className="text-fg-soft" />} text="Add a debt to stress-test your plan." />
        ))}
      {tab === "goal" &&
        (activeDebts.length > 0 ? (
          <GoalSection debts={activeDebts} currency={currency} userId={userId} />
        ) : (
          <EmptyHint icon={<Target size={32} className="text-fg-soft" />} text="Add a debt to set a payoff goal." />
        ))}
    </div>
  );
}

function EmptyHint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="text-center py-16">
      <div className="mx-auto mb-3 w-fit">{icon}</div>
      <p className="text-fg-muted text-sm flex items-center justify-center gap-1.5">
        <Wallet size={14} /> {text}
      </p>
    </div>
  );
}
