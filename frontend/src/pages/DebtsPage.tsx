import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus, X, CreditCard, CheckCircle2, ChevronDown, ChevronUp, Loader2,
  ArrowDown, Unlock, Eye, EyeOff, TrendingDown, Rocket, Clock, Flame,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { debtsApi } from "@/api/debts";
import { fmt, fmtCompact } from "@/lib/format";
import {
  simulatePayoff, singlePayoff, requiredPaymentForTenure,
  type SimDebt, type SeriesPoint, type SinglePayoff,
} from "@/lib/payoff";
import type { Debt } from "@/types";

const DEBT_TYPES = [
  { value: "CREDIT_CARD", label: "Credit Card" },
  { value: "CREDIT_CARD_LOAN", label: "Credit Card Loan" },
  { value: "PERSONAL_LOAN", label: "Personal Loan" },
  { value: "HOME_LOAN", label: "Home Loan" },
  { value: "EDUCATION", label: "Education" },
  { value: "VEHICLE", label: "Vehicle" },
  { value: "OVERDRAFT", label: "Overdraft" },
  { value: "JEWEL_LOAN", label: "Jewel Loan" },
  { value: "INFORMAL", label: "Informal (friends/family)" },
  { value: "OTHER", label: "Other" },
] as const;

function debtLabel(type: string) {
  return DEBT_TYPES.find((t) => t.value === type)?.label ?? type;
}

function DebtCard({
  debt,
  currency,
  onPay,
  onConfirmEmi,
}: {
  debt: Debt;
  currency: string;
  onPay: (d: Debt) => void;
  onConfirmEmi: (d: Debt) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const paidThisMonth = debt.payments.some((p) => new Date(p.paymentDate) >= startOfMonth);

  return (
    <div className="card animate-slide-up">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-medium text-fg truncate">{debt.name}</h3>
          <p className="text-xs text-fg-muted">
            {debtLabel(debt.type)}
            {debt.lender ? ` · ${debt.lender}` : ""}
            {debt.apr > 0 ? ` · ${debt.apr}%` : ""}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="number text-lg font-semibold text-fg">{fmt(debt.balance, currency)}</p>
          <p className="text-xs text-fg-muted">
            {debt.paidPercent.toFixed(0)}% paid · {(100 - Math.min(debt.paidPercent, 100)).toFixed(0)}% remaining
          </p>
        </div>
      </div>

      {/* Dual-tone bar: fill = paid, track = remaining (utilized) */}
      {(() => {
        const remaining = 100 - Math.min(debt.paidPercent, 100);
        const fillColor = remaining > 65 ? "#E8524A" : remaining > 30 ? "#10B981" : "#10B981";
        const trackColor = remaining > 65 ? "rgba(232,82,74,0.18)" : remaining > 30 ? "rgba(240,180,41,0.18)" : "rgba(16,185,129,0.18)";
        return (
          <div className="mb-3 rounded-full overflow-hidden" style={{ height: "7px", backgroundColor: trackColor }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(debt.paidPercent, 100)}%`, backgroundColor: fillColor }}
            />
          </div>
        );
      })()}

      {/* Stats */}
      <div className="flex gap-3 text-center mb-3">
        <div className="flex-1 rounded-lg bg-bg py-2">
          <p className="text-[11px] text-fg-muted">Min/mo</p>
          <p className="number text-sm font-semibold text-fg">{fmt(debt.minimumPayment, currency)}</p>
        </div>
        <div className="flex-1 rounded-lg bg-bg py-2">
          <p className="text-[11px] text-fg-muted">EMI</p>
          <p className="number text-sm font-semibold text-fg">
            {debt.emiSummary.totalEmis
              ? `${debt.emiSummary.emisPaid}/${debt.emiSummary.totalEmis}`
              : `${debt.emiSummary.emisPaid} paid`}
          </p>
        </div>
        <div className="flex-1 rounded-lg bg-bg py-2">
          <p className="text-[11px] text-fg-muted">Next</p>
          <p className="text-sm font-medium text-fg">
            {debt.emiSummary.nextEmiDate
              ? format(new Date(debt.emiSummary.nextEmiDate), "d MMM")
              : "—"}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={() => onPay(debt)} className="btn-primary flex-1 text-xs">
          Log payment
        </button>
        {!paidThisMonth && (
          <button onClick={() => onConfirmEmi(debt)} className="btn-secondary text-xs">
            Confirm EMI
          </button>
        )}
      </div>

      {/* Payment history — motivational calendar for every debt */}
      <div className="mt-3 pt-3 border-t border-border">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center justify-between w-full text-xs text-fg-muted hover:text-fg"
        >
          <span>Payment history{debt._count.payments > 0 ? ` (${debt._count.payments})` : ""}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {expanded && <EmiCalendar debt={debt} currency={currency} />}
      </div>
    </div>
  );
}

const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function motivationLine(pct: number): string {
  if (pct >= 90) return "So close — final EMIs!";
  if (pct >= 75) return "Final stretch — keep going!";
  if (pct >= 50) return "Over halfway there!";
  if (pct >= 25) return "Great momentum!";
  if (pct > 0) return "Every EMI counts — you've got this.";
  return "Your journey starts now.";
}

function EmiCalendar({ debt, currency }: { debt: Debt; currency: string }) {
  const s = debt.emiSummary;
  // Scheduled mode: fixed-term loan with a known EMI schedule.
  // Open-ended mode: credit card / overdraft / no term — heatmap of months a payment was logged.
  const scheduled = !!(s.totalEmis && s.emiStartDate);
  const anchorStr = s.emiStartDate ?? debt.startDate;
  if (!anchorStr) return null;

  const anchor = new Date(anchorStr);
  const startYear = anchor.getFullYear();
  const startMonth = anchor.getMonth();
  const startM = new Date(startYear, startMonth, 1);

  const now = new Date();
  const elapsed = Math.max(1, (now.getFullYear() - startYear) * 12 + (now.getMonth() - startMonth) + 1);
  const total = scheduled ? s.totalEmis! : elapsed;

  const endM = new Date(startYear, startMonth + (total - 1), 1);
  const endYear = endM.getFullYear();

  const confirmedKeys = new Set(
    debt.payments.map((p) => {
      const d = new Date(p.paymentDate);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }),
  );

  const paid = scheduled ? s.emisPaid : confirmedKeys.size;
  const nextNo = s.emisPaid + 1; // scheduled "next due"
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;

  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);

  return (
    <div className="mt-3">
      {/* Motivational header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Flame size={14} className="text-sage-600" />
          <span className="number text-sm font-semibold text-fg">
            {paid} of {total} {scheduled ? "paid" : "months paid"}
          </span>
          <span className="text-xs text-fg-muted">· {Math.round(pct)}%</span>
        </div>
        <span className="text-[11px] text-sage-700 font-medium">{motivationLine(pct)}</span>
      </div>

      {/* Calendar grid — GitHub-contribution style small blocks */}
      <div className="overflow-x-auto -mx-1">
        <div className="min-w-max px-1 space-y-[3px]">
          <div className="flex items-center gap-[3px]">
            <span className="w-6 flex-shrink-0" />
            {MONTH_LETTERS.map((m, i) => (
              <span key={i} className="w-[18px] text-center text-[9px] text-fg-soft flex-shrink-0">{m}</span>
            ))}
          </div>
          {years.map((year) => (
            <div key={year} className="flex items-center gap-[3px]">
              <span className="number w-6 flex-shrink-0 text-[9px] text-fg-muted">{`'${String(year).slice(2)}`}</span>
              {Array.from({ length: 12 }, (_, month) => {
                const cellDate = new Date(year, month, 1);
                const inRange = cellDate >= startM && cellDate <= endM;
                if (!inRange) return <span key={month} className="w-[18px] h-[18px] flex-shrink-0" />;

                const emiNo = (year - startYear) * 12 + (month - startMonth) + 1;
                const isThisMonth = year === now.getFullYear() && month === now.getMonth();
                let isPaid: boolean;
                let isNext: boolean;
                if (scheduled) {
                  isPaid = emiNo <= paid;
                  isNext = emiNo === nextNo;
                } else {
                  isPaid = confirmedKeys.has(`${year}-${month}`);
                  isNext = isThisMonth && !isPaid;
                }

                const state = isPaid
                  ? "paid"
                  : isNext
                    ? scheduled ? "next due" : "due this month"
                    : scheduled ? "upcoming" : "no payment logged";
                const tip = scheduled
                  ? `${format(cellDate, "MMM yyyy")} · EMI ${emiNo}/${total} · ${state}`
                  : `${format(cellDate, "MMM yyyy")} · ${state}`;

                return (
                  <div
                    key={month}
                    title={tip}
                    className="w-[18px] h-[18px] flex-shrink-0 rounded-[3px] transition-all"
                    style={
                      isPaid
                        ? { backgroundColor: "#10B981" }
                        : isNext
                          ? { backgroundColor: "transparent", border: "2px solid #10B981", opacity: 0.85 }
                          : { backgroundColor: "var(--color-border)" }
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 text-[10px] text-fg-muted">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: "#10B981" }} /> Paid
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[2px]" style={{ border: "2px solid #10B981" }} />
          {scheduled ? "Next" : "This month"}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[2px] bg-border" /> {scheduled ? "To go" : "No log"}
        </span>
      </div>

      {/* Logged payments */}
      {debt.payments.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-border space-y-1.5">
          {debt.payments.slice(0, 6).map((p) => (
            <li key={p.id} className="flex items-center justify-between text-xs">
              <span className="text-fg-muted">{format(new Date(p.paymentDate), "d MMM yyyy")}</span>
              <span className="number font-medium text-fg">{fmt(p.amount, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SLIDER_PRESETS = [0, 2000, 5000, 10000, 20000, 30000];
const SLIDER_MIN = 0;
const SLIDER_MAX = 50000;
const SLIDER_STEP = 500;

interface TooltipPayloadItem {
  value: number;
  dataKey: string;
  payload: SeriesPoint;
}

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  currency: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]!.payload;
  const acc = point.accelerated ?? 0;
  const base = point.baseline ?? 0;
  const saved = base - acc;
  return (
    <div className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="number font-semibold text-fg mb-1">{monthLabel(point.month)}</p>
      <p className="flex items-center justify-between gap-4">
        <span className="text-sage-700">With plan</span>
        <span className="number text-fg">{fmt(acc, currency)}</span>
      </p>
      <p className="flex items-center justify-between gap-4">
        <span className="text-fg-muted">Minimums only</span>
        <span className="number text-fg-muted">{fmt(base, currency)}</span>
      </p>
      {saved > 0 && (
        <p className="flex items-center justify-between gap-4 mt-1 pt-1 border-t border-border">
          <span className="text-fg-muted">Ahead by</span>
          <span className="number text-sage-700 font-medium">{fmt(saved, currency)}</span>
        </p>
      )}
    </div>
  );
}

function monthShort(m: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + m, 1);
  return format(target, "MMM ''yy");
}

function monthLabel(m: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + m, 1);
  return format(target, "MMM yyyy");
}

function durationLabel(m: number): string {
  const y = Math.floor(m / 12);
  const mo = m % 12;
  if (y > 0 && mo > 0) return `${y}y ${mo}m`;
  if (y > 0) return `${y}y`;
  return `${mo}m`;
}

const TIMELINE_COLORS = [
  "bg-indigo-500",
  "bg-sage-600",
  "bg-clay-600",
  "bg-purple-500",
  "bg-cyan-500",
  "bg-pink-500",
];

function PayoffSimulator({ debts, currency }: { debts: Debt[]; currency: string }) {
  const [strategy, setStrategy] = useState<"avalanche" | "snowball">("avalanche");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const totalMinAll = debts.reduce((s, d) => s + d.minimumPayment, 0);
  const [extra, setExtra] = useState<number>(() => {
    const def = Math.round((totalMinAll * 0.2) / SLIDER_STEP) * SLIDER_STEP;
    return Math.min(Math.max(def, SLIDER_MIN), SLIDER_MAX);
  });

  const simDebts: SimDebt[] = useMemo(
    () =>
      debts
        .filter((d) => !excluded.has(d.id))
        .map((d) => ({
          id: d.id,
          name: d.name,
          balance: d.balance,
          apr: d.apr,
          minimumPayment: d.minimumPayment,
          type: d.type,
        })),
    [debts, excluded],
  );

  const sim = useMemo(() => simulatePayoff(simDebts, extra, strategy), [simDebts, extra, strategy]);

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pct = ((extra - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;
  const hasDebts = simDebts.length > 0;
  const stuck = hasDebts && sim.months >= 600;
  const len = TIMELINE_COLORS.length;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-fg-muted uppercase tracking-wider">Payoff simulator</span>
          <div className="flex rounded-lg bg-bg p-0.5 text-xs">
            {(["avalanche", "snowball"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setStrategy(m)}
                className={`px-3 py-1 rounded-md font-medium transition-all duration-200 ${
                  strategy === m ? "bg-surface text-sage-700 shadow-sm" : "text-fg-muted"
                }`}
              >
                {m === "avalanche" ? "Avalanche" : "Snowball"}
              </button>
            ))}
          </div>
        </div>

        {/* Extra payment slider */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs text-fg-muted">Extra payment / month</span>
            <span className="number text-lg font-semibold text-sage-700">{fmt(extra, currency)}</span>
          </div>
          <input
            type="range"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={SLIDER_STEP}
            value={extra}
            onChange={(e) => setExtra(Number(e.target.value))}
            className="w-full h-1.5 appearance-none rounded-full outline-none cursor-pointer"
            style={{ background: `linear-gradient(to right, #10B981 ${pct}%, var(--color-border) ${pct}%)` }}
          />
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {SLIDER_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setExtra(p)}
                className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                  extra === p
                    ? "bg-sage-600 text-white border-sage-600 font-semibold"
                    : "border-border text-fg-muted hover:border-sage-300 hover:text-sage-700"
                }`}
              >
                {p === 0 ? "Min only" : fmt(p, currency)}
              </button>
            ))}
          </div>
        </div>

        {stuck && (
          <p className="text-xs text-coral-600 bg-coral-50 border border-coral-200 rounded-lg px-3 py-2">
            At this rate the debt never fully clears — interest outpaces payments. Increase the extra payment.
          </p>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card py-3 px-2">
          <p className="text-[10px] text-fg-muted mb-0.5 truncate">Debt-free</p>
          <p className="number text-sm font-bold text-sage-700 truncate">{hasDebts ? durationLabel(sim.months) : "—"}</p>
          {sim.monthsSaved > 0 && (
            <p className="text-[10px] text-sage-700 mt-0.5 truncate">{durationLabel(sim.monthsSaved)} sooner</p>
          )}
        </div>
        <div className="card py-3 px-2">
          <p className="text-[10px] text-fg-muted mb-0.5 truncate">Interest</p>
          <p className="number text-sm font-bold text-fg truncate">{hasDebts ? fmt(sim.totalInterest, currency) : "—"}</p>
          {sim.interestSaved > 0 && (
            <p className="text-[10px] text-sage-700 mt-0.5 truncate">{fmt(sim.interestSaved, currency)} saved</p>
          )}
        </div>
        <div className="card py-3 px-2">
          <p className="text-[10px] text-fg-muted mb-0.5 truncate">Free by</p>
          <p className="text-xs font-bold text-fg mt-1 truncate">{hasDebts ? monthLabel(sim.months) : "—"}</p>
        </div>
      </div>

      {/* Line chart — balance over time */}
      {hasDebts && (
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-fg-muted uppercase tracking-wider">Balance over time</span>
            <div className="flex items-center gap-3 text-[11px] text-fg-muted">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-1 rounded-full bg-sage-600" />With plan</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-1 rounded-full bg-fg-soft" />Minimums only</span>
            </div>
          </div>
          <p className="text-[11px] text-fg-muted mb-4">
            The gap between the lines is how much faster the cascade clears your debt.
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={sim.series} margin={{ top: 5, right: 10, left: -6, bottom: 0 }}>
              <defs>
                <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3D4166" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#3D4166" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={(m) => monthShort(Number(m))}
                tick={{ fontSize: 10, fill: "#6B7099" }}
                tickLine={false}
                axisLine={{ stroke: "var(--color-border)" }}
                interval="preserveStartEnd"
                minTickGap={44}
              />
              <YAxis
                tickFormatter={(v) => `₹${fmtCompact(Number(v))}`}
                tick={{ fontSize: 10, fill: "#6B7099" }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip
                content={(props) => (
                  <ChartTooltip
                    active={props.active}
                    payload={props.payload as unknown as TooltipPayloadItem[]}
                    currency={currency}
                  />
                )}
              />
              <Area
                type="monotone"
                dataKey="baseline"
                stroke="#6B7099"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fill="url(#baseGrad)"
                dot={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="accelerated"
                stroke="#10B981"
                strokeWidth={2.5}
                fill="url(#accGrad)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Editable debt list */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-fg-muted uppercase tracking-wider">Debts in this plan</span>
          <span className="text-[11px] text-fg-muted">Tap to include / exclude</span>
        </div>
        <div className="space-y-2">
          {debts.map((d) => {
            const off = excluded.has(d.id);
            return (
              <button
                key={d.id}
                onClick={() => toggle(d.id)}
                className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                  off ? "border-border bg-transparent opacity-50" : "border-border-strong bg-bg"
                }`}
              >
                {off ? (
                  <EyeOff size={16} className="text-fg-soft flex-shrink-0" />
                ) : (
                  <Eye size={16} className="text-sage-600 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium truncate ${off ? "text-fg-muted line-through" : "text-fg"}`}>
                    {d.name}
                  </p>
                  <p className="text-[11px] text-fg-muted">
                    {d.apr}% APR · min {fmt(d.minimumPayment, currency)}/mo
                  </p>
                </div>
                <span className="number text-sm font-semibold text-fg flex-shrink-0">{fmt(d.balance, currency)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cascade timeline */}
      <div className="card">
        <span className="text-xs font-medium text-fg-muted uppercase tracking-wider block mb-1">How the money cascades</span>
        <p className="text-[11px] text-fg-muted mb-4">
          Each time a loan closes, its EMI rolls into the next one — so the next loan clears faster.
        </p>

        {!hasDebts ? (
          <p className="text-sm text-fg-muted">Select at least one debt to simulate.</p>
        ) : (
          <>
            {/* Stacked timeline bar */}
            <div className="flex rounded-lg overflow-hidden h-5 mb-2">
              {sim.cascades.map((c, i) => {
                const prev = i === 0 ? 0 : sim.cascades[i - 1]!.closeMonth;
                const span = c.closeMonth - prev;
                const widthPct = sim.months > 0 ? (span / sim.months) * 100 : 0;
                return (
                  <div
                    key={i}
                    className={`${TIMELINE_COLORS[i % len]} transition-all duration-300`}
                    style={{ width: `${Math.max(widthPct, 3)}%` }}
                    title={`${c.closedName}: closes ${monthLabel(c.closeMonth)}`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-fg-soft mb-5">
              <span>Now</span>
              <span>{monthLabel(sim.months)}</span>
            </div>

            {/* Vertical cascade list */}
            <div className="relative">
              {sim.cascades.map((c, i) => {
                const isLast = c.targetName === null;
                return (
                  <div key={i} className="relative pl-8 pb-6 last:pb-0">
                    {!isLast && <div className="absolute left-[13px] top-6 bottom-0 w-px bg-border" />}
                    <div className={`absolute left-1.5 top-1 w-5 h-5 rounded-full ${TIMELINE_COLORS[i % len]} flex items-center justify-center`}>
                      <CheckCircle2 size={12} className="text-white" />
                    </div>

                    <div className="bg-bg rounded-xl px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-fg">{c.closedName}</span>
                        <span className="number text-xs font-semibold text-sage-700">{monthLabel(c.closeMonth)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-fg-muted">
                        <span>Closes in <span className="number font-medium text-fg">{durationLabel(c.closeMonth)}</span></span>
                        <span>·</span>
                        <span>Interest <span className="number font-medium text-fg">{fmt(c.totalInterest, currency)}</span></span>
                      </div>

                      {!isLast ? (
                        <div className="mt-2.5 pt-2.5 border-t border-border space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1 text-xs text-sage-700 font-medium">
                              <Unlock size={12} /> {fmt(c.freedAmount, currency)}/mo freed
                            </span>
                            <ArrowDown size={12} className="text-fg-soft" />
                            <span className="text-xs text-fg-muted">
                              rolls into <span className="font-medium text-fg">{c.targetName}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                            <TrendingDown size={12} className="text-sage-600" />
                            <span>
                              <span className="font-medium text-fg">{c.targetName}</span> EMI jumps to{" "}
                              <span className="number font-semibold text-sage-700">{fmt(c.newTargetEMI, currency)}/mo</span>
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2.5 pt-2.5 border-t border-border">
                          <p className="text-xs text-sage-700 font-medium">
                            Debt-free! All {fmt(sim.monthlyBudget, currency)}/mo is now yours.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const TENURE_PRESETS = [6, 12, 18, 24, 36, 48, 60];

interface LoanCalc {
  debt: Debt;
  naturalMonths: number | null;
  target: number;
  maxTenure: number;
  req: number;
  reqSim: SinglePayoff;
  extra: number;
  interestSaved: number | null;
  monthsSaved: number | null;
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

function LoanAcceleratorCard({
  calc,
  currency,
  onTarget,
}: {
  calc: LoanCalc;
  currency: string;
  onTarget: (months: number) => void;
}) {
  const { debt, naturalMonths, target, maxTenure, req, reqSim, extra, interestSaved, monthsSaved } = calc;
  const minTenure = 1;
  const pct = ((target - minTenure) / Math.max(maxTenure - minTenure, 1)) * 100;
  const presets = TENURE_PRESETS.filter((t) => t <= maxTenure);

  // Mini bar chart — min EMI vs target EMI, scaled to the larger one.
  const maxEMI = Math.max(req, debt.minimumPayment, 1);
  const minBarPct = (debt.minimumPayment / maxEMI) * 100;
  const targetBarPct = (req / maxEMI) * 100;

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium text-fg truncate">{debt.name}</h3>
          <p className="number text-xs text-fg-muted">{fmt(debt.balance, currency)} · {debt.apr}% APR</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] text-fg-muted">At min EMI</p>
          <p className="number text-sm font-semibold text-fg">
            {naturalMonths != null ? durationLabel(naturalMonths) : "Never clears"}
          </p>
        </div>
      </div>

      {/* Tenure slider */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs text-fg-muted flex items-center gap-1.5">
            <Clock size={13} /> Close it in
          </span>
          <span className="number text-base font-semibold text-sage-700">{durationLabel(target)}</span>
        </div>
        <input
          type="range"
          min={minTenure}
          max={maxTenure}
          step={1}
          value={target}
          onChange={(e) => onTarget(Number(e.target.value))}
          className="w-full h-1.5 appearance-none rounded-full outline-none cursor-pointer"
          style={{ background: `linear-gradient(to right, #10B981 ${pct}%, var(--color-border) ${pct}%)` }}
        />
        {presets.length > 0 && (
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {presets.map((t) => (
              <button
                key={t}
                onClick={() => onTarget(t)}
                className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                  target === t
                    ? "bg-sage-600 text-white border-sage-600 font-semibold"
                    : "border-border text-fg-muted hover:border-sage-300 hover:text-sage-700"
                }`}
              >
                {durationLabel(t)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Min vs target mini bar chart */}
      <div className="space-y-2.5">
        <div>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-fg-muted">
              Min EMI · {naturalMonths != null ? durationLabel(naturalMonths) : "never clears"}
            </span>
            <span className="number text-fg">{fmt(debt.minimumPayment, currency)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-border overflow-hidden">
            <div className="h-full rounded-full bg-fg-soft transition-all duration-500" style={{ width: `${minBarPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-sage-700 font-medium">Target EMI · {durationLabel(target)}</span>
            <span className="number text-sage-700 font-medium">{fmt(req, currency)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-border overflow-hidden">
            <div className="h-full rounded-full bg-sage-600 transition-all duration-500" style={{ width: `${targetBarPct}%` }} />
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="rounded-xl bg-bg p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] text-fg-muted mb-0.5">Pay this EMI</p>
            <p className="number text-xl font-semibold text-sage-700">
              {fmt(req, currency)}
              <span className="text-xs text-fg-muted font-normal">/mo</span>
            </p>
            {extra > 0 && (
              <p className="number text-[11px] text-fg-muted mt-0.5">+{fmt(extra, currency)} over min</p>
            )}
          </div>
          <div>
            <p className="text-[11px] text-fg-muted mb-0.5">Debt-free by</p>
            <p className="text-sm font-semibold text-fg mt-1.5">{monthLabel(reqSim.months)}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-xs flex-wrap">
          <span className="text-fg-muted">
            Interest <span className="number font-medium text-fg">{fmt(reqSim.totalInterest, currency)}</span>
          </span>
          {interestSaved != null && interestSaved > 0 && (
            <span className="flex items-center gap-1 text-sage-700">
              <TrendingDown size={12} /> {fmt(interestSaved, currency)} saved
            </span>
          )}
          {monthsSaved != null && monthsSaved > 0 && (
            <span className="text-sage-700">{durationLabel(monthsSaved)} sooner</span>
          )}
        </div>
      </div>
    </div>
  );
}

function CloseFasterSection({ debts, currency }: { debts: Debt[]; currency: string }) {
  const [targets, setTargets] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const d of debts) {
      const cur = singlePayoff(toSim(d), d.minimumPayment);
      const nat = cur.closes ? cur.months : null;
      init[d.id] = nat ? Math.max(1, Math.round(nat / 2)) : 24;
    }
    return init;
  });

  function setTarget(id: string, months: number) {
    setTargets((prev) => ({ ...prev, [id]: months }));
  }

  const calcs: LoanCalc[] = useMemo(
    () =>
      debts.map((d) => {
        const sim = toSim(d);
        const current = singlePayoff(sim, d.minimumPayment);
        const naturalMonths = current.closes ? current.months : null;
        const maxTenure = naturalMonths ?? 84;
        const raw = targets[d.id] ?? (naturalMonths ? Math.round(naturalMonths / 2) : 24);
        const target = Math.min(Math.max(raw, 1), maxTenure);
        const req = requiredPaymentForTenure(sim, target);
        const reqSim = singlePayoff(sim, req);
        const extra = Math.max(0, req - d.minimumPayment);
        const interestSaved = current.closes ? Math.max(0, current.totalInterest - reqSim.totalInterest) : null;
        const monthsSaved = naturalMonths != null ? Math.max(0, naturalMonths - reqSim.months) : null;
        return { debt: d, naturalMonths, target, maxTenure, req, reqSim, extra, interestSaved, monthsSaved };
      }),
    [debts, targets],
  );

  // Combined roll-up across all loans.
  const totalMin = debts.reduce((s, d) => s + d.minimumPayment, 0);
  const totalTargetEMI = calcs.reduce((s, c) => s + c.req, 0);
  const totalExtra = Math.max(0, totalTargetEMI - totalMin);
  const totalInterestSaved = calcs.reduce((s, c) => s + (c.interestSaved ?? 0), 0);
  const lastFreeMonth = calcs.length ? Math.max(...calcs.map((c) => c.reqSim.months)) : 0;

  return (
    <div className="space-y-4">
      <div className="card flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-sage-100 flex items-center justify-center flex-shrink-0">
          <Rocket size={18} className="text-sage-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-fg">Close each loan faster</p>
          <p className="text-xs text-fg-muted mt-0.5">
            Pick a target tenure for any loan to see the EMI it takes — and the interest you'd save.
          </p>
        </div>
      </div>

      {/* Combined roll-up */}
      <div className="card border-sage-300">
        <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">If you hit every target</p>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="number text-3xl font-semibold text-sage-700">{fmt(totalTargetEMI, currency)}</span>
          <span className="text-sm text-fg-muted">/mo total</span>
        </div>
        <p className="number text-xs text-fg-muted">
          {fmt(totalMin, currency)} minimums + {fmt(totalExtra, currency)} extra
        </p>
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
          <div>
            <p className="text-[11px] text-fg-muted mb-0.5">All clear by</p>
            <p className="text-sm font-semibold text-fg">{lastFreeMonth ? monthLabel(lastFreeMonth) : "—"}</p>
          </div>
          <div>
            <p className="text-[11px] text-fg-muted mb-0.5">Interest saved</p>
            <p className="number text-sm font-semibold text-sage-700">{fmt(totalInterestSaved, currency)}</p>
          </div>
        </div>
      </div>

      {calcs.map((c) => (
        <LoanAcceleratorCard
          key={c.debt.id}
          calc={c}
          currency={currency}
          onTarget={(m) => setTarget(c.debt.id, m)}
        />
      ))}
    </div>
  );
}

function AddDebtModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    type: "PERSONAL_LOAN",
    balance: "",
    originalAmount: "",
    apr: "",
    minimumPayment: "",
    dueDate: "",
    lender: "",
    startDate: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await debtsApi.create({
        name: form.name,
        type: form.type,
        balance: Number(form.balance),
        originalAmount: Number(form.originalAmount || form.balance),
        apr: Number(form.apr || 0),
        minimumPayment: Number(form.minimumPayment || 0),
        dueDate: parseInt(form.dueDate || "1"),
        lender: form.lender || undefined,
        startDate: form.startDate,
      });
      toast.success("Debt added");
      void qc.invalidateQueries({ queryKey: ["debts"] });
      void qc.invalidateQueries({ queryKey: ["today"] });
      onClose();
    } catch {
      toast.error("Failed to add debt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-surface border border-border rounded-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-medium text-fg">Add a debt</h2>
          <button onClick={onClose} className="text-fg-soft hover:text-fg p-1"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3 max-h-[70vh] overflow-y-auto scrollbar-hide">
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="HDFC Credit Card" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={(e) => set("type", e.target.value)}>
                {DEBT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Current balance</label>
              <input type="number" className="input" value={form.balance} onChange={(e) => set("balance", e.target.value)} placeholder="42500" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Original amount</label>
              <input type="number" className="input" value={form.originalAmount} onChange={(e) => set("originalAmount", e.target.value)} placeholder="50000" />
            </div>
            <div>
              <label className="label">APR %</label>
              <input type="number" step="0.01" className="input" value={form.apr} onChange={(e) => set("apr", e.target.value)} placeholder="18" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Min payment/mo</label>
              <input type="number" className="input" value={form.minimumPayment} onChange={(e) => set("minimumPayment", e.target.value)} placeholder="2450" />
            </div>
            <div>
              <label className="label">Due day (1-31)</label>
              <input type="number" min="1" max="31" className="input" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} placeholder="15" />
            </div>
          </div>
          <div>
            <label className="label">Start date</label>
            <input type="date" className="input" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>
          <div>
            <label className="label">Lender (optional)</label>
            <input className="input" value={form.lender} onChange={(e) => set("lender", e.target.value)} placeholder="HDFC Bank" />
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full mt-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {saving ? "Saving..." : "Add debt"}
          </button>
        </form>
      </div>
    </div>
  );
}

function PaymentModal({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const qc = useQueryClient();
  const currency = useAuthStore((s) => s.user?.currency ?? "INR");
  const [amount, setAmount] = useState(String(Math.round(debt.minimumPayment)));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const amt = Number(amount || 0);
  const monthlyRate = debt.apr / 100 / 12;
  const interest = debt.balance * monthlyRate;
  const principal = Math.max(0, amt - interest);
  const newBalance = Math.max(0, debt.balance - principal);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await debtsApi.addPayment(debt.id, { amount: amt, paymentDate: date, note: note || undefined });
      toast.success("Payment logged");
      void qc.invalidateQueries({ queryKey: ["debts"] });
      void qc.invalidateQueries({ queryKey: ["today"] });
      onClose();
    } catch {
      toast.error("Failed to log payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-surface border border-border rounded-2xl overflow-hidden animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-medium text-fg">Log payment — {debt.name}</h2>
          <button onClick={onClose} className="text-fg-soft hover:text-fg p-1"><X size={16} /></button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-3 gap-2 text-center rounded-xl bg-sage-50 p-3 mb-4">
            <div>
              <p className="text-[11px] text-fg-muted">Interest</p>
              <p className="number text-sm font-semibold text-fg">{fmt(Math.min(interest, amt), currency)}</p>
            </div>
            <div>
              <p className="text-[11px] text-fg-muted">Principal</p>
              <p className="number text-sm font-semibold text-sage-700">{fmt(principal, currency)}</p>
            </div>
            <div>
              <p className="text-[11px] text-fg-muted">After</p>
              <p className="number text-sm font-semibold text-fg">{fmt(newBalance, currency)}</p>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="label">Amount</label>
              <input type="number" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Note (optional)</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Extra payment" />
            </div>
            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? "Saving..." : "Log payment"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function DebtsPage() {
  const qc = useQueryClient();
  const currency = useAuthStore((s) => s.user?.currency ?? "INR");
  const [showAdd, setShowAdd] = useState(false);
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null);
  const [tab, setTab] = useState<"debts" | "strategy" | "faster">("debts");

  const { data: debts, isLoading } = useQuery({
    queryKey: ["debts"],
    queryFn: debtsApi.list,
  });

  const confirmEmi = useMutation({
    mutationFn: (id: string) => debtsApi.confirmEmi(id),
    onSuccess: () => {
      toast.success("EMI confirmed");
      void qc.invalidateQueries({ queryKey: ["debts"] });
      void qc.invalidateQueries({ queryKey: ["today"] });
    },
  });

  const activeDebts = debts?.filter((d) => !d.isPaidOff) ?? [];
  const paidDebts = debts?.filter((d) => d.isPaidOff) ?? [];
  const totalDebt = activeDebts.reduce((s, d) => s + d.balance, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="heading-serif text-2xl text-fg tracking-tight">Debts</h1>
          {!isLoading && activeDebts.length > 0 && (
            <p className="number text-sm text-fg-muted mt-0.5">{fmt(totalDebt, currency)} total</p>
          )}
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-xs">
          <Plus size={15} /> Add
        </button>
      </div>

      {/* Tabs */}
      {!isLoading && activeDebts.length > 0 && (
        <div className="flex gap-4 border-b border-border overflow-x-auto">
          {(["debts", "strategy", "faster"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 text-sm font-medium transition-colors whitespace-nowrap ${
                tab === t ? "tab-active" : "tab-inactive"
              }`}
            >
              {t === "debts" ? "My debts" : t === "strategy" ? "Strategy" : "Close faster"}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}
        </div>
      )}

      {/* Empty */}
      {!isLoading && activeDebts.length === 0 && (
        <div className="text-center py-16">
          <CreditCard size={32} className="mx-auto mb-3 text-fg-soft" />
          <p className="text-fg-muted text-sm mb-4">No debts tracked yet.</p>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus size={16} /> Add your first debt
          </button>
        </div>
      )}

      {/* Debts list */}
      {!isLoading && tab === "debts" && (
        <div className="space-y-4">
          {activeDebts.map((d) => (
            <DebtCard
              key={d.id}
              debt={d}
              currency={currency}
              onPay={setPayingDebt}
              onConfirmEmi={(debt) => confirmEmi.mutate(debt.id)}
            />
          ))}

          {paidDebts.length > 0 && (
            <div className="pt-4">
              <p className="text-xs text-fg-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-sage" /> Paid off ({paidDebts.length})
              </p>
              {paidDebts.map((d) => (
                <div key={d.id} className="flex items-center gap-3 py-2 text-sm text-fg-muted">
                  <CheckCircle2 size={16} className="text-sage flex-shrink-0" />
                  <span className="line-through">{d.name}</span>
                  {d.paidOffAt && (
                    <span className="ml-auto text-xs">{format(new Date(d.paidOffAt), "d MMM yyyy")}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Strategy */}
      {!isLoading && tab === "strategy" && activeDebts.length > 0 && (
        <PayoffSimulator debts={activeDebts} currency={currency} />
      )}
      {!isLoading && tab === "strategy" && activeDebts.length === 0 && (
        <div className="text-center py-16">
          <CreditCard size={32} className="mx-auto mb-3 text-fg-soft" />
          <p className="text-fg-muted text-sm">Add a debt to simulate your payoff plan.</p>
        </div>
      )}

      {/* Close faster */}
      {!isLoading && tab === "faster" && activeDebts.length > 0 && (
        <CloseFasterSection debts={activeDebts} currency={currency} />
      )}
      {!isLoading && tab === "faster" && activeDebts.length === 0 && (
        <div className="text-center py-16">
          <CreditCard size={32} className="mx-auto mb-3 text-fg-soft" />
          <p className="text-fg-muted text-sm">Add a debt to explore faster payoff options.</p>
        </div>
      )}

      {/* Modals */}
      {showAdd && <AddDebtModal onClose={() => setShowAdd(false)} />}
      {payingDebt && <PaymentModal debt={payingDebt} onClose={() => setPayingDebt(null)} />}
    </div>
  );
}
