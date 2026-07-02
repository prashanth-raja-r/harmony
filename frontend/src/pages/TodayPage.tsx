import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertCircle, CheckCircle2, CreditCard, Flame, Plus,
  TrendingDown, ArrowRight, Sparkles, TrendingUp,
  Wallet, Receipt, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { NavLink } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { todayApi } from "@/api/today";
import { scenariosApi } from "@/api/scenarios";
import { moneyApi } from "@/api/money";
import { debtsApi } from "@/api/debts";
import { fmt } from "@/lib/format";
import type { TodayData, ScenarioResult, Debt, Transaction } from "@/types";

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}

function QuickAdd({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !desc) return;
    setSaving(true);
    try {
      await moneyApi.addTransaction({
        amount: Number(amount),
        description: desc,
        date: new Date().toISOString(),
      });
      toast.success("Expense logged");
      setAmount("");
      setDesc("");
      setOpen(false);
      onAdded();
    } catch {
      toast.error("Failed to log expense");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary w-full gap-2">
        <Plus size={16} /> Log an expense
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 pt-2">
      <div className="flex gap-3">
        <input
          type="number"
          className="input flex-1"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
        <input
          className="input flex-1"
          placeholder="What for?"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving ? "Saving..." : "Add"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}

function WhatIfButton({ amount, label, currency }: { amount: number; label: string; currency: string }) {
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function simulate() {
    if (result) { setResult(null); return; }
    setLoading(true);
    try {
      const data = await scenariosApi.simulate({ type: "extra_debt_payment", extraPayment: amount });
      setResult(data);
    } catch {
      toast.error("Could not simulate");
    } finally {
      setLoading(false);
    }
  }

  const debtMetric = result?.keyMetrics.find((m) => m.label.toLowerCase().includes("debt"));

  return (
    <div className="flex-1">
      <button
        onClick={simulate}
        disabled={loading}
        className={`w-full text-left rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 border ${
          result
            ? "bg-sage-100 border-sage-300 text-sage-800"
            : "bg-surface border-border text-fg-muted hover:border-sage-300 hover:text-sage-700"
        }`}
      >
        <span className="number text-base font-semibold">{label}</span>
        <span className="block text-xs mt-0.5">
          {loading ? "Calculating..." : result && debtMetric ? `${debtMetric.delta} less debt in 24mo` : "extra/month"}
        </span>
      </button>
      {result && debtMetric && (
        <p className="text-xs text-sage-700 mt-1.5 px-1">{debtMetric.scenario} remaining</p>
      )}
    </div>
  );
}

const DISMISSED_KEY = () => `harmony_dismissed_${new Date().toISOString().slice(0, 10)}`;

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY());
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY(), JSON.stringify([...ids]));
}

export default function TodayPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const mobile = useIsMobile();
  const currency = user?.currency ?? "INR";
  const firstName = user?.name?.split(" ")[0] ?? "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);

  const { data, isLoading, isError } = useQuery({ queryKey: ["today"], queryFn: todayApi.get });
  const { data: summary } = useQuery({ queryKey: ["money-summary"], queryFn: () => moneyApi.summary() });
  const { data: debts } = useQuery({ queryKey: ["debts"], queryFn: debtsApi.list });
  const { data: txPage } = useQuery({ queryKey: ["transactions-recent"], queryFn: () => moneyApi.transactions(1, 6) });

  const completeMut = useMutation({
    mutationFn: todayApi.completeAction,
    onSuccess: (_res, id) => {
      const next = new Set(dismissed).add(id);
      setDismissed(next);
      saveDismissed(next);
      void qc.invalidateQueries({ queryKey: ["today"] });
    },
  });

  function invalidateAll() {
    void qc.invalidateQueries({ queryKey: ["today"] });
    void qc.invalidateQueries({ queryKey: ["money-summary"] });
    void qc.invalidateQueries({ queryKey: ["transactions-recent"] });
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-28 rounded-2xl" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.625rem" }}>
          <div className="skeleton h-20 rounded-2xl" />
          <div className="skeleton h-20 rounded-2xl" />
          <div className="skeleton h-20 rounded-2xl" />
          <div className="skeleton h-20 rounded-2xl" />
        </div>
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm bg-coral-50 border border-coral-200 text-coral-700">
        <AlertCircle size={16} />
        Could not load your data. Make sure the backend is running.
      </div>
    );
  }

  const d = data as TodayData;
  const visibleActions = d.actions.filter((a) => !dismissed.has(a.id));
  const topAction = visibleActions[0];
  const activeDebts = (debts ?? []).filter((debt) => !debt.isPaidOff).slice(0, 3);
  const recentTx = (txPage?.items ?? []).slice(0, 6);
  const topCategories = (summary?.byCategory ?? []).slice(0, 4);
  const totalCatSpend = topCategories.reduce((a, c) => a + c.total, 0);
  const isOverBudget = d.todaySpend > d.dailyBudget;
  const savingsRate = summary?.savingsRate ?? 0;

  return (
    <div className="animate-fade-in space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1
            className="heading-serif text-fg tracking-tight"
            style={{ fontSize: mobile ? "1.5rem" : "1.875rem" }}
          >
            {greeting}, {firstName}.
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
        </div>
        {d.streak && d.streak.current > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-clay-50 border border-clay-200 flex-shrink-0">
            <Flame size={13} className="text-clay-600" />
            <span className="number text-sm font-semibold text-clay-800">{d.streak.current}</span>
            <span className="text-xs text-clay-700">{mobile ? "days" : `day streak · best: ${d.streak.longest}`}</span>
          </div>
        )}
      </div>

      {/* Primary action */}
      {topAction && (
        <div className="card-action">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-sage-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              {topAction.type === "pay_debt" || topAction.type === "confirm_emi"
                ? <CreditCard size={18} className="text-sage-600" />
                : topAction.type === "celebrate"
                ? <Sparkles size={18} className="text-clay-600" />
                : <ArrowRight size={18} className="text-sage-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-fg">{topAction.title}</p>
              {topAction.description && (
                <p className="text-sm text-fg-muted mt-0.5">{topAction.description}</p>
              )}
            </div>
            {!topAction.isCompleted && topAction.type !== "celebrate" && (
              <button
                onClick={() => completeMut.mutate(topAction.id)}
                className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}

      {/* Secondary actions — grouped into one card */}
      {visibleActions.length > 1 && (
        <div className="card" style={{ padding: 0 }}>
          {visibleActions.slice(1).map((action, i) => (
            <div
              key={action.id}
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: i < visibleActions.length - 2 ? "1px solid var(--color-border)" : "none" }}
            >
              <CheckCircle2 size={18} className={action.isCompleted ? "text-sage-600" : "text-fg-soft"} />
              <span className={`text-sm flex-1 ${action.isCompleted ? "line-through text-fg-soft" : "text-fg"}`}>
                {action.title}
              </span>
              {!action.isCompleted && (
                <button
                  onClick={() => completeMut.mutate(action.id)}
                  className="text-xs text-sage-600 hover:text-sage-700 font-medium"
                >
                  Done
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* KPI grid — 2 cols on mobile, 4 cols on desktop */}
      <div style={{
        display: "grid",
        gridTemplateColumns: mobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
        gap: mobile ? "0.625rem" : "1rem",
      }}>
        <div className="card">
          <div className="flex items-center gap-1.5 mb-2">
            <Receipt size={12} className="text-fg-muted flex-shrink-0" />
            <span className="text-[10px] font-medium text-fg-muted uppercase tracking-wider truncate">Spent</span>
          </div>
          <p className="number font-semibold text-fg truncate" style={{ fontSize: mobile ? "1.1rem" : "1.5rem" }}>
            {fmt(summary?.totalSpend ?? 0, currency)}
          </p>
          <p className="text-[11px] text-fg-muted mt-1 leading-tight truncate">
            {(summary?.monthlyIncome ?? 0) > 0 ? `of ${fmt(summary!.monthlyIncome, currency)}` : "this month"}
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp size={12} className="text-fg-muted flex-shrink-0" />
            <span className="text-[10px] font-medium text-fg-muted uppercase tracking-wider truncate">Savings</span>
          </div>
          <p
            className="number font-semibold truncate"
            style={{
              fontSize: mobile ? "1.1rem" : "1.5rem",
              color: savingsRate >= 20 ? "var(--color-sage-600)" : savingsRate > 0 ? "var(--color-sage-700)" : "var(--color-fg)",
            }}
          >
            {Math.round(savingsRate)}%
          </p>
          <p className="text-[11px] text-fg-muted mt-1 leading-tight truncate">
            {(summary?.savings ?? 0) > 0 ? fmt(summary!.savings, currency) : "rate this month"}
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-1.5 mb-2">
            <CreditCard size={12} className="text-fg-muted flex-shrink-0" />
            <span className="text-[10px] font-medium text-fg-muted uppercase tracking-wider truncate">Debt</span>
          </div>
          <p className="number font-semibold text-fg truncate" style={{ fontSize: mobile ? "1.1rem" : "1.5rem" }}>
            {fmt(d.debtFree.totalDebt, currency)}
          </p>
          <p className="text-[11px] text-fg-muted mt-1 leading-tight truncate">
            {d.debtFree.monthsRemaining
              ? `${d.debtFree.monthsRemaining}mo to free`
              : activeDebts.length === 0
              ? "no active debts"
              : "total balance"}
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-1.5 mb-2">
            <Wallet size={12} className="text-fg-muted flex-shrink-0" />
            <span className="text-[10px] font-medium text-fg-muted uppercase tracking-wider truncate">Today</span>
          </div>
          <p
            className="number font-semibold truncate"
            style={{
              fontSize: mobile ? "1.1rem" : "1.5rem",
              color: isOverBudget ? "var(--color-coral-600)" : "var(--color-fg)",
            }}
          >
            {fmt(d.todaySpend, currency)}
          </p>
          <p
            className="text-[11px] mt-1 leading-tight truncate"
            style={{ color: isOverBudget ? "var(--color-coral-600)" : "var(--color-fg-muted)" }}
          >
            {isOverBudget ? "over budget" : `of ${fmt(d.dailyBudget, currency)}`}
          </p>
        </div>
      </div>

      {/* Body grid — 1 col on mobile, 3fr+2fr on desktop */}
      <div style={{
        display: "grid",
        gridTemplateColumns: mobile ? "1fr" : "3fr 2fr",
        gap: "1.25rem",
        alignItems: "start",
      }}>

        {/* ── Main column ── */}
        <div className="space-y-4 min-w-0">

          {/* Today spending + QuickAdd */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-fg-muted uppercase tracking-wider">Today's spending</span>
              <span className="number text-sm font-semibold" style={{ color: isOverBudget ? "var(--color-coral-600)" : "var(--color-fg)" }}>
                {fmt(d.todaySpend, currency)}
                <span className="text-fg-soft font-normal"> / {fmt(d.dailyBudget, currency)}</span>
              </span>
            </div>
            {isOverBudget && (
              <p className="flex items-center gap-1.5 text-xs text-coral-600 mb-3">
                <TrendingDown size={13} /> Over daily budget
              </p>
            )}
            {d.dailyBudget > 0 && (
              <div className="progress-bar mb-3">
                <div
                  className={`progress-fill ${isOverBudget ? "bg-coral-500" : "bg-sage"}`}
                  style={{ width: `${Math.min(100, (d.todaySpend / d.dailyBudget) * 100)}%` }}
                />
              </div>
            )}
            <QuickAdd onAdded={invalidateAll} />
          </div>

          {/* Recent transactions */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-fg-muted uppercase tracking-wider">Recent transactions</span>
              <NavLink to="/spending" className="text-xs text-sage-600 hover:text-sage-700 font-medium flex items-center gap-1">
                View all <ChevronRight size={12} />
              </NavLink>
            </div>
            {recentTx.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-fg-muted">No transactions yet</p>
                <NavLink to="/spending" className="text-xs text-sage-600 hover:text-sage-700 mt-1 inline-block">
                  Add your first expense →
                </NavLink>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentTx.map((tx: Transaction) => (
                  <div key={tx.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                      style={{ backgroundColor: tx.category?.color ? `${tx.category.color}22` : "var(--color-border)" }}
                    >
                      {tx.category?.icon ?? "💸"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-fg truncate">{tx.description}</p>
                      <p className="text-xs text-fg-muted">
                        {tx.category?.name ?? "Uncategorised"} · {format(new Date(tx.date), "d MMM")}
                      </p>
                    </div>
                    <span className="number text-sm font-semibold text-coral-600 flex-shrink-0">
                      −{fmt(tx.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* What-if */}
          {d.debtFree.totalDebt > 0 && (
            <div>
              <span className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2 block">
                What if you paid extra?
              </span>
              <div className="flex gap-3">
                <WhatIfButton amount={5000} label={`+${fmt(5000, currency)}`} currency={currency} />
                <WhatIfButton amount={10000} label={`+${fmt(10000, currency)}`} currency={currency} />
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar column ── */}
        <div className="space-y-4 min-w-0">

          {/* Debt snapshot */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-fg-muted uppercase tracking-wider">Debt snapshot</span>
              <NavLink to="/debts" className="text-xs text-sage-600 hover:text-sage-700 font-medium flex items-center gap-1">
                Manage <ChevronRight size={12} />
              </NavLink>
            </div>
            {activeDebts.length === 0 ? (
              <div className="text-center py-4">
                <CreditCard size={24} className="text-fg-soft mx-auto mb-2" />
                <p className="text-sm text-fg-muted">No debts tracked</p>
                <NavLink to="/debts" className="text-xs text-sage-600 hover:text-sage-700 mt-1 inline-block">
                  Add a debt →
                </NavLink>
              </div>
            ) : (
              <div className="space-y-4">
                {activeDebts.map((debt: Debt) => (
                  <div key={debt.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-fg truncate flex-1 mr-2">{debt.name}</span>
                      <span className="number text-sm font-semibold text-fg flex-shrink-0">
                        {fmt(debt.balance, currency)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="progress-bar flex-1">
                        <div className="progress-fill bg-sage" style={{ width: `${Math.min(100, debt.paidPercent)}%` }} />
                      </div>
                      <span className="text-xs text-fg-muted flex-shrink-0">{Math.round(debt.paidPercent)}%</span>
                    </div>
                    <p className="text-xs text-fg-muted">{debt.apr}% APR · min {fmt(debt.minimumPayment, currency)}/mo</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Spending by category */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-fg-muted uppercase tracking-wider">This month</span>
              <NavLink to="/spending" className="text-xs text-sage-600 hover:text-sage-700 font-medium flex items-center gap-1">
                Details <ChevronRight size={12} />
              </NavLink>
            </div>
            {topCategories.length === 0 ? (
              <div className="text-center py-4">
                <Receipt size={24} className="text-fg-soft mx-auto mb-2" />
                <p className="text-sm text-fg-muted">No spending this month</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topCategories.map((cat) => {
                  const pct = totalCatSpend > 0 ? (cat.total / totalCatSpend) * 100 : 0;
                  return (
                    <div key={cat.categoryId}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm">{cat.icon}</span>
                          <span className="text-sm text-fg truncate">{cat.name}</span>
                        </div>
                        <span className="number text-sm font-semibold text-fg ml-2 flex-shrink-0">
                          {fmt(cat.total, currency)}
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${pct}%`, backgroundColor: cat.color ?? "var(--color-sage-600)" }}
                        />
                      </div>
                    </div>
                  );
                })}
                {summary && summary.totalSpend > 0 && (
                  <div className="pt-2 border-t border-border flex items-center justify-between">
                    <span className="text-xs text-fg-muted">Total</span>
                    <span className="number text-sm font-semibold text-fg">{fmt(summary.totalSpend, currency)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Debt-free countdown */}
          {d.debtFree.totalDebt > 0 && (
            <div className="card border-sage-300">
              <span className="text-xs font-medium text-sage-600 uppercase tracking-wider mb-3 block">
                Debt-free countdown
              </span>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="number text-2xl font-semibold text-fg">
                  {fmt(d.debtFree.totalDebt, currency)}
                </span>
                <span className="text-sm text-fg-muted">remaining</span>
              </div>
              {d.debtFree.monthsRemaining && (
                <p className="text-sm text-sage-600 mt-1">🎯 {d.debtFree.monthsRemaining} months to go</p>
              )}
              {d.debtFree.debtFreeDate && (
                <p className="text-xs text-fg-muted mt-0.5">
                  Target: {format(new Date(d.debtFree.debtFreeDate), "MMM yyyy")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
