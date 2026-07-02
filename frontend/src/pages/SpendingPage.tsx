import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus, TrendingUp, TrendingDown, X, Loader2, Wallet,
  ArrowDownLeft, ArrowUpRight, Pencil, Trash2, FileDown, Printer,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { moneyApi } from "@/api/money";
import { useQueryClient } from "@tanstack/react-query";
import { fmt } from "@/lib/format";
import type { MonthlySummary, Income, SpendingTrend } from "@/types";

/* ─── CategoryBar ─────────────────────────────────────────────── */
function CategoryBar({
  name, icon, amount, total, budgeted, currency,
}: {
  name: string; icon: string; amount: number; total: number;
  budgeted?: number; currency: string;
}) {
  const pct = budgeted ? Math.min((amount / budgeted) * 100, 100) : total > 0 ? (amount / total) * 100 : 0;
  const overBudget = budgeted && amount > budgeted;
  return (
    <div className="flex items-center gap-3">
      <span className="text-base w-6 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-fg truncate">{name}</span>
          <span className="number text-sm font-medium text-fg ml-2 flex-shrink-0">
            {fmt(amount, currency)}
            {budgeted ? (
              <span className={`text-xs ml-1 font-normal ${overBudget ? "text-coral" : "text-fg-muted"}`}>
                / {fmt(budgeted, currency)}
              </span>
            ) : null}
          </span>
        </div>
        <div className="progress-bar">
          <div
            className={`progress-fill ${overBudget ? "bg-coral" : pct > 80 ? "bg-clay" : "bg-sage"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── AddTransactionModal ─────────────────────────────────────── */
function AddTransactionModal({
  onClose, categories, currency,
}: {
  onClose: () => void;
  categories: Array<{ id: string; name: string; icon: string }>;
  currency: string;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await moneyApi.addTransaction({ amount: Number(amount), description: desc, categoryId: categoryId || undefined, date });
      toast.success("Expense logged");
      void qc.invalidateQueries({ queryKey: ["money-summary"] });
      void qc.invalidateQueries({ queryKey: ["today"] });
      void qc.invalidateQueries({ queryKey: ["money-trends"] });
      onClose();
    } catch {
      toast.error("Failed to log expense");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-surface border border-border rounded-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-medium text-fg">Log expense</h2>
          <button onClick={onClose} className="text-fg-soft hover:text-fg p-1"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <label className="label">Amount ({currency})</label>
            <input type="number" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="250" required autoFocus />
          </div>
          <div>
            <label className="label">What for?</label>
            <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Coffee" required />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {saving ? "Saving..." : "Add expense"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── IncomeModal ─────────────────────────────────────────────── */
function IncomeModal({ income, onClose, currency = "INR" }: { income?: Income; onClose: () => void; currency?: string }) {
  const qc = useQueryClient();
  const editing = !!income;
  const [source, setSource] = useState(income?.source ?? "");
  const [type, setType] = useState(income?.type ?? "SALARY");
  const [amount, setAmount] = useState(income ? String(income.amount) : "");
  const [frequency, setFrequency] = useState(income?.frequency ?? "MONTHLY");
  const [date, setDate] = useState(
    income ? new Date(income.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["money-summary"] });
    void qc.invalidateQueries({ queryKey: ["income"] });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const dto = { source, type, amount: Number(amount), frequency, date };
      if (editing) { await moneyApi.updateIncome(income.id, dto); toast.success("Income updated"); }
      else { await moneyApi.addIncome(dto); toast.success("Income added"); }
      refresh();
      onClose();
    } catch {
      toast.error(editing ? "Failed to update income" : "Failed to add income");
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!editing) return;
    setDeleting(true);
    try {
      await moneyApi.deleteIncome(income.id);
      toast.success("Income removed");
      refresh();
      onClose();
    } catch {
      toast.error("Failed to remove income");
    } finally { setDeleting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-surface border border-border rounded-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-medium text-fg">{editing ? "Edit income" : "Add income"}</h2>
          <button onClick={onClose} className="text-fg-soft hover:text-fg p-1"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <label className="label">Source</label>
            <input className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Infosys, Freelance client" required autoFocus />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="SALARY">Salary</option>
              <option value="FREELANCE">Freelance</option>
              <option value="BUSINESS">Business</option>
              <option value="INVESTMENTS">Investment</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="label">Amount ({currency})</label>
            <input type="number" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="150000" required />
          </div>
          <div>
            <label className="label">Frequency</label>
            <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="MONTHLY">Monthly</option>
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Bi-weekly</option>
              <option value="ANNUAL">Annual</option>
              <option value="ONE_TIME">One-time</option>
            </select>
          </div>
          <div>
            <label className="label">Date received</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <button type="submit" disabled={saving || deleting} className="btn-primary w-full">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {saving ? "Saving..." : editing ? "Save changes" : "Add income"}
          </button>
          {editing && (
            <button type="button" onClick={remove} disabled={saving || deleting}
              className="w-full flex items-center justify-center gap-1.5 text-sm text-coral-600 hover:text-coral-500 py-2 font-medium transition-colors disabled:opacity-50">
              {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              {deleting ? "Removing..." : "Remove income"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

/* ─── TrendsTab ───────────────────────────────────────────────── */
function TrendsTab({
  trends, period, setPeriod, currency,
}: {
  trends: SpendingTrend | undefined;
  period: number;
  setPeriod: (p: number) => void;
  currency: string;
}) {
  if (!trends) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-9 w-36 rounded-xl" />
        <div className="skeleton h-72 rounded-2xl" />
        <div className="skeleton h-44 rounded-2xl" />
      </div>
    );
  }

  const hasData = trends.chartData.some((d) => (d.total as number) > 0);

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex gap-1 bg-bg border border-border rounded-xl p-1 w-fit">
        {([3, 6, 12] as const).map((m) => (
          <button
            key={m}
            onClick={() => setPeriod(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              period === m ? "bg-sage-100 text-sage-700" : "text-fg-muted hover:text-fg hover:bg-black/5"
            }`}
          >
            {m}M
          </button>
        ))}
      </div>

      {/* Stacked bar chart */}
      <div className="card">
        <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-4">Monthly Spending</p>
        {!hasData ? (
          <div className="h-40 flex items-center justify-center text-sm text-fg-muted">
            No spending data for this period yet
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={trends.chartData}
                barSize={28}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "var(--color-fg-muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--color-fg-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-bg)", opacity: 0.5 }}
                  contentStyle={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "0.75rem",
                    fontSize: "12px",
                    padding: "8px 12px",
                  }}
                  formatter={((value: unknown, name: unknown) => [fmt(Number(value ?? 0), currency), String(name)]) as never}
                  labelStyle={{ fontWeight: 600, marginBottom: "4px", color: "var(--color-fg)" }}
                />
                {trends.categories.map((cat) => (
                  <Bar key={cat.id} dataKey={cat.name} stackId="a" fill={cat.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-border">
              {trends.categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-xs text-fg-muted">{cat.icon} {cat.name}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Delta cards */}
      {trends.deltas.length > 0 && (
        <div className="card">
          <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">vs Last Month</p>
          {trends.deltas.every((d) => d.current === 0 && d.previous === 0) ? (
            <p className="text-sm text-fg-muted text-center py-4">Not enough data across months yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {trends.deltas
                .filter((d) => d.current > 0 || d.previous > 0)
                .map((d) => (
                  <div key={d.id} className="bg-bg rounded-xl p-3 border border-border">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-base leading-none">{d.icon}</span>
                      <span className="text-xs text-fg-muted truncate">{d.name}</span>
                    </div>
                    <p className="number text-sm font-semibold text-fg">{fmt(d.current, currency)}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {d.delta > 0 ? (
                        <TrendingUp size={11} className="text-coral flex-shrink-0" />
                      ) : d.delta < 0 ? (
                        <TrendingDown size={11} className="text-sage-600 flex-shrink-0" />
                      ) : (
                        <span className="w-[11px]" />
                      )}
                      <span className={`text-[11px] font-medium ${d.delta > 0 ? "text-coral" : d.delta < 0 ? "text-sage-700" : "text-fg-muted"}`}>
                        {d.delta === 0
                          ? "No change"
                          : `${d.delta > 0 ? "+" : ""}${fmt(Math.abs(d.delta), currency)}`}
                      </span>
                      {d.delta !== 0 && d.pct !== 0 && (
                        <span className="text-[10px] text-fg-soft">
                          ({d.delta > 0 ? "+" : ""}{d.pct}%)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Report HTML generator ───────────────────────────────────── */
function buildReportHTML(data: MonthlySummary, monthName: string, year: number, currency: string): string {
  const fmtAmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

  const savingsColor = data.savings >= 0 ? "#16a34a" : "#dc2626";

  const budgetRows = data.budgetStatus
    .map((b) => {
      const over = b.spent > b.budgeted;
      return `<tr>
        <td>${b.category?.icon ?? ""} ${b.category?.name ?? "Unknown"}</td>
        <td class="r">${fmtAmt(b.budgeted)}</td>
        <td class="r ${over ? "red" : ""}">${fmtAmt(b.spent)}</td>
        <td class="r ${over ? "red" : "green"}">${over ? "−" : "+"}${fmtAmt(Math.abs(b.remaining))}</td>
        <td class="r ${b.pct > 100 ? "red" : b.pct > 80 ? "amber" : ""}">${b.pct.toFixed(0)}%</td>
      </tr>`;
    })
    .join("");

  const txnRows = data.transactions
    .map((t) => {
      const d = new Date(t.date);
      const ds = `${d.getDate()} ${d.toLocaleString("en-IN", { month: "short" })}`;
      return `<tr>
        <td>${ds}</td>
        <td>${t.description}</td>
        <td>${t.category ? `${t.category.icon} ${t.category.name}` : "Uncategorised"}</td>
        <td class="r">${fmtAmt(t.amount)}</td>
      </tr>`;
    })
    .join("");

  const generatedDate = new Date().toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Harmony — ${monthName} ${year}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;background:#fff;padding:2.5rem;font-size:13px;line-height:1.5}
.hd{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1.75rem;padding-bottom:1.25rem;border-bottom:2px solid #e5e7eb}
.brand{color:#4b7c5c;font-weight:700;font-size:.875rem;margin-bottom:.25rem;letter-spacing:.02em}
.hd h1{font-size:1.375rem;font-weight:700}
.meta{color:#9ca3af;font-size:.75rem;text-align:right;line-height:1.7}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:2rem}
.metric{border:1px solid #e5e7eb;border-radius:.5rem;padding:1rem}
.metric .lbl{font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:.25rem}
.metric .val{font-size:1.25rem;font-weight:700}
.metric .sub{font-size:.7rem;color:#9ca3af;margin-top:.125rem}
h2{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin:1.75rem 0 .75rem}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;border-bottom:2px solid #e5e7eb;padding:.5rem .375rem}
td{padding:.4375rem .375rem;border-bottom:1px solid #f9fafb;font-size:.8125rem}
.r{text-align:right;font-variant-numeric:tabular-nums}
.green{color:#16a34a}.red{color:#dc2626}.amber{color:#d97706}
.footer{margin-top:2.5rem;padding-top:1rem;border-top:1px solid #e5e7eb;color:#d1d5db;font-size:.7rem;text-align:center}
@media print{body{padding:1cm}@page{margin:1cm}}
</style>
</head>
<body>
<div class="hd">
  <div>
    <div class="brand">harmony</div>
    <h1>${monthName} ${year} — Financial Report</h1>
  </div>
  <div class="meta">Generated ${generatedDate}<br>${data.transactionCount} transaction${data.transactionCount !== 1 ? "s" : ""}</div>
</div>
<div class="grid">
  <div class="metric"><div class="lbl">Total Income</div><div class="val">${fmtAmt(data.monthlyIncome)}</div></div>
  <div class="metric"><div class="lbl">Total Spend</div><div class="val">${fmtAmt(data.totalSpend)}</div></div>
  <div class="metric">
    <div class="lbl">Net Savings</div>
    <div class="val" style="color:${savingsColor}">${fmtAmt(data.savings)}</div>
    <div class="sub">Savings rate: ${data.savingsRate.toFixed(1)}%</div>
  </div>
</div>
${data.budgetStatus.length > 0 ? `<h2>Budget Summary</h2>
<table><thead><tr><th>Category</th><th class="r">Budgeted</th><th class="r">Spent</th><th class="r">Balance</th><th class="r">Used</th></tr></thead>
<tbody>${budgetRows}</tbody></table>` : ""}
${data.transactions.length > 0 ? `<h2>Transactions</h2>
<table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="r">Amount</th></tr></thead>
<tbody>${txnRows}</tbody></table>` : ""}
<div class="footer">harmony · Personal Finance · Auto-generated report</div>
</body>
</html>`;
}

/* ─── ReportModal ─────────────────────────────────────────────── */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ReportModal({
  onClose, initialMonth, initialYear, currency,
}: {
  onClose: () => void;
  initialMonth: number;
  initialYear: number;
  currency: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const now = new Date();
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  const { data: reportData, isLoading } = useQuery<MonthlySummary>({
    queryKey: ["report-summary", month, year],
    queryFn: () => moneyApi.summary(month, year),
  });

  const monthName = MONTH_NAMES[month - 1]!;

  function downloadCSV() {
    if (!reportData) return;
    const lines: string[][] = [
      [`Harmony Finance Report — ${monthName} ${year}`],
      [`Generated: ${new Date().toLocaleDateString("en-IN")}`],
      [],
      ["SUMMARY"],
      ["Income", String(reportData.monthlyIncome)],
      ["Spent", String(reportData.totalSpend)],
      ["Saved", String(reportData.savings)],
      ["Savings Rate", `${reportData.savingsRate.toFixed(1)}%`],
      [],
      ["BUDGET SUMMARY"],
      ["Category", "Budgeted", "Spent", "Remaining", "% Used"],
      ...reportData.budgetStatus.map((b) => [
        b.category?.name ?? "Unknown",
        String(b.budgeted),
        String(b.spent),
        String(b.remaining),
        `${b.pct.toFixed(0)}%`,
      ]),
      [],
      ["TRANSACTIONS"],
      ["Date", "Description", "Category", "Amount (INR)"],
      ...reportData.transactions.map((t) => [
        format(new Date(t.date), "dd/MM/yyyy"),
        t.description,
        t.category?.name ?? "Uncategorised",
        String(t.amount),
      ]),
    ];
    const csv = lines
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `harmony-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  }

  function openPDF() {
    if (!reportData) return;
    const html = buildReportHTML(reportData, monthName, year, currency);
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { toast.error("Allow pop-ups to open the PDF report"); return; }
    win.document.write(html);
    win.document.close();
    win.addEventListener("load", () => win.print());
    toast.success("Report opened — Print → Save as PDF");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-surface border border-border rounded-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-fg">Export Report</h2>
            <p className="text-xs text-fg-muted mt-0.5">Download CSV or print as PDF</p>
          </div>
          <button onClick={onClose} className="text-fg-soft hover:text-fg p-1 mt-0.5">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Month / Year selectors */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Month</label>
              <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTH_NAMES.map((name, i) => (
                  <option key={i + 1} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Year</label>
              <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Preview */}
          {isLoading && <div className="skeleton h-20 rounded-xl" />}
          {reportData && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-bg rounded-xl p-3 text-center border border-border">
                  <p className="text-[10px] text-fg-muted uppercase tracking-wider">Income</p>
                  <p className="number text-xs font-semibold text-sage-700 mt-0.5">
                    {fmt(reportData.monthlyIncome, currency)}
                  </p>
                </div>
                <div className="bg-bg rounded-xl p-3 text-center border border-border">
                  <p className="text-[10px] text-fg-muted uppercase tracking-wider">Spent</p>
                  <p className="number text-xs font-semibold text-fg mt-0.5">
                    {fmt(reportData.totalSpend, currency)}
                  </p>
                </div>
                <div className="bg-bg rounded-xl p-3 text-center border border-border">
                  <p className="text-[10px] text-fg-muted uppercase tracking-wider">Saved</p>
                  <p className={`number text-xs font-semibold mt-0.5 ${reportData.savings >= 0 ? "text-sage-700" : "text-coral"}`}>
                    {fmt(Math.abs(reportData.savings), currency)}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-fg-soft text-center">
                {reportData.transactionCount} transaction{reportData.transactionCount !== 1 ? "s" : ""}
                {reportData.budgetStatus.length > 0 ? ` · ${reportData.budgetStatus.length} budgets tracked` : ""}
              </p>
            </>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={downloadCSV}
              disabled={!reportData || isLoading}
              className="btn-secondary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileDown size={14} /> Download CSV
            </button>
            <button
              onClick={openPDF}
              disabled={!reportData || isLoading}
              className="btn-primary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Printer size={14} /> Print / PDF
            </button>
          </div>
          <p className="text-[10px] text-fg-soft text-center">
            PDF opens in a new tab — Print → Save as PDF
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── SpendingPage ────────────────────────────────────────────── */
export default function SpendingPage() {
  const currency = useAuthStore((s) => s.user?.currency ?? "INR");
  const [activeTab, setActiveTab] = useState<"overview" | "trends">("overview");
  const [trendPeriod, setTrendPeriod] = useState(6);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [editIncome, setEditIncome] = useState<Income | null>(null);
  const [showReport, setShowReport] = useState(false);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const { data: summary, isLoading } = useQuery<MonthlySummary>({
    queryKey: ["money-summary"],
    queryFn: () => moneyApi.summary(currentMonth, currentYear),
  });

  const { data: incomes } = useQuery<Income[]>({
    queryKey: ["income"],
    queryFn: moneyApi.getIncome,
  });

  const { data: trends } = useQuery<SpendingTrend>({
    queryKey: ["money-trends", trendPeriod],
    queryFn: () => moneyApi.trends(trendPeriod),
    enabled: activeTab === "trends",
    staleTime: 5 * 60 * 1000,
  });

  const totalSpend = summary?.totalSpend ?? 0;
  const monthlyIncome = summary?.monthlyIncome ?? 0;
  const savings = summary?.savings ?? 0;
  const savingsRate = summary?.savingsRate ?? 0;
  const byCategory = summary?.byCategory ?? [];
  const budgetStatus = summary?.budgetStatus ?? [];
  const transactions = summary?.transactions ?? [];
  const categories = summary?.categories ?? [];

  const categoryRows = byCategory.map((cat) => {
    const budget = budgetStatus.find((b) => b.categoryId === cat.categoryId);
    return { ...cat, budgeted: budget?.budgeted };
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="heading-serif text-2xl text-fg tracking-tight">Spending</h1>
          <p className="text-sm text-fg-muted mt-0.5">{format(now, "MMMM yyyy")}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
          <button onClick={() => setShowReport(true)} className="btn-secondary text-xs">
            <FileDown size={14} /> Export
          </button>
          <button onClick={() => setShowAddIncome(true)} className="btn-secondary text-xs">
            <Wallet size={14} /> Income
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-xs">
            <Plus size={15} /> Expense
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-bg border border-border rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === "overview" ? "bg-surface shadow-sm text-fg" : "text-fg-muted hover:text-fg"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab("trends")}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === "trends" ? "bg-surface shadow-sm text-fg" : "text-fg-muted hover:text-fg"
          }`}
        >
          <TrendingUp size={12} /> Trends
        </button>
      </div>

      {/* Trends tab */}
      {activeTab === "trends" && (
        <TrendsTab
          trends={trends}
          period={trendPeriod}
          setPeriod={setTrendPeriod}
          currency={currency}
        />
      )}

      {/* Overview tab */}
      {activeTab === "overview" && (
        <>
          {isLoading && (
            <div className="space-y-4">
              <div className="skeleton h-28 rounded-2xl" />
              <div className="skeleton h-40 rounded-2xl" />
            </div>
          )}

          {!isLoading && (
            <>
              {/* Cashflow summary */}
              <div className="card">
                <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">This month</p>
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <ArrowDownLeft size={13} className="text-sage-600" />
                      <span className="text-xs text-fg-muted">Income</span>
                    </div>
                    <p className="number text-lg font-semibold text-fg">{fmt(monthlyIncome, currency)}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <ArrowUpRight size={13} className="text-coral" />
                      <span className="text-xs text-fg-muted">Spent</span>
                    </div>
                    <p className="number text-lg font-semibold text-fg">{fmt(totalSpend, currency)}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <Wallet size={13} className={savings >= 0 ? "text-sage-600" : "text-coral"} />
                      <span className="text-xs text-fg-muted">Saved</span>
                    </div>
                    <p className={`number text-lg font-semibold ${savings >= 0 ? "text-sage-700" : "text-coral"}`}>
                      {fmt(Math.abs(savings), currency)}
                    </p>
                  </div>
                </div>
                {monthlyIncome > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-fg-muted">Savings rate</span>
                      <span className={`number text-xs font-semibold ${savingsRate >= 20 ? "text-sage-700" : savingsRate >= 10 ? "text-clay-700" : "text-coral"}`}>
                        {Math.round(savingsRate)}%
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className={`progress-fill ${savingsRate >= 20 ? "bg-sage" : savingsRate >= 10 ? "bg-clay" : "bg-coral"}`}
                        style={{ width: `${Math.max(0, Math.min(savingsRate, 100))}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Income sources */}
              {incomes && incomes.length > 0 && (
                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Income sources</p>
                    <button onClick={() => setShowAddIncome(true)} className="text-xs text-sage-600 hover:text-sage-700 font-medium">
                      + Add
                    </button>
                  </div>
                  <div className="space-y-1">
                    {incomes.map((inc) => (
                      <button
                        key={inc.id}
                        onClick={() => setEditIncome(inc)}
                        className="group w-full flex items-center justify-between gap-3 -mx-2 px-2 py-1.5 rounded-lg text-left hover:bg-bg transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-fg font-medium truncate">{inc.source}</p>
                          <p className="text-xs text-fg-muted capitalize">{inc.type.toLowerCase()} · {inc.frequency.toLowerCase()}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="number text-sm font-semibold text-sage-700">{fmt(inc.amount, currency)}</span>
                          <Pencil size={13} className="text-fg-soft opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(!incomes || incomes.length === 0) && (
                <button
                  onClick={() => setShowAddIncome(true)}
                  className="w-full card text-left border-dashed hover:border-sage-300 transition-colors"
                >
                  <div className="flex items-center gap-3 text-fg-muted">
                    <Wallet size={18} className="text-sage-400" />
                    <div>
                      <p className="text-sm font-medium text-fg">Add your income</p>
                      <p className="text-xs">Track salary or freelance income to see your savings rate</p>
                    </div>
                  </div>
                </button>
              )}

              {/* Category breakdown */}
              {categoryRows.length > 0 && (
                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">By category</p>
                    <span className="text-xs text-fg-muted">{summary?.transactionCount} transactions</span>
                  </div>
                  <div className="space-y-3">
                    {categoryRows.map((c) => (
                      <CategoryBar
                        key={c.categoryId}
                        name={c.name}
                        icon={c.icon}
                        amount={c.total}
                        total={totalSpend}
                        budgeted={c.budgeted}
                        currency={currency}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Recent transactions */}
              {transactions.length > 0 && (
                <div className="card">
                  <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">Recent</p>
                  <div className="space-y-2">
                    {transactions.slice(0, 10).map((t) => (
                      <div key={t.id} className="flex items-center justify-between py-1.5">
                        <div className="min-w-0">
                          <p className="text-sm text-fg truncate">{t.description}</p>
                          <p className="text-xs text-fg-muted">
                            {t.category && `${t.category.icon} ${t.category.name} · `}
                            {format(new Date(t.date), "d MMM")}
                          </p>
                        </div>
                        <span className="number text-sm font-medium text-fg ml-3 flex-shrink-0">
                          {fmt(t.amount, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {totalSpend === 0 && transactions.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-fg-muted text-sm mb-4">No expenses this month yet.</p>
                  <button onClick={() => setShowAdd(true)} className="btn-primary">
                    <Plus size={16} /> Log your first expense
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Modals */}
      {showAdd && <AddTransactionModal onClose={() => setShowAdd(false)} categories={categories} currency={currency} />}
      {showAddIncome && <IncomeModal onClose={() => setShowAddIncome(false)} currency={currency} />}
      {editIncome && <IncomeModal income={editIncome} onClose={() => setEditIncome(null)} currency={currency} />}
      {showReport && (
        <ReportModal
          onClose={() => setShowReport(false)}
          initialMonth={currentMonth}
          initialYear={currentYear}
          currency={currency}
        />
      )}
    </div>
  );
}
