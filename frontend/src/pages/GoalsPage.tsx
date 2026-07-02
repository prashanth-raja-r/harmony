import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Target, PiggyBank, Shield, CreditCard, TrendingUp, Plane,
  Plus, Check, ChevronDown, ChevronUp, Edit2, Trash2,
  Calendar, DollarSign, Flag, X, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { goalsApi, type CreateGoalDto } from "@/api/goals";
import { fmt, fmtCompact, shortDate } from "@/lib/format";
import type { Goal, GoalMilestone } from "@/types";

const GOAL_TYPES = [
  { value: "SAVINGS",        label: "Savings",        icon: PiggyBank,  color: "#F59E0B" },
  { value: "EMERGENCY_FUND", label: "Emergency Fund", icon: Shield,     color: "#10B981" },
  { value: "DEBT_PAYOFF",    label: "Debt Payoff",    icon: CreditCard, color: "#F43F5E" },
  { value: "INVESTMENT",     label: "Investment",     icon: TrendingUp, color: "#6366F1" },
  { value: "TRAVEL",         label: "Travel",         icon: Plane,      color: "#06B6D4" },
  { value: "OTHER",          label: "Other",          icon: Target,     color: "#94A3B8" },
] as const;

function typeInfo(type: string) {
  return GOAL_TYPES.find((t) => t.value === type) ?? GOAL_TYPES[GOAL_TYPES.length - 1]!;
}

function scoreColor(pct: number) {
  if (pct >= 75) return "var(--color-sage-600)";
  if (pct >= 40) return "var(--color-clay-600)";
  return "var(--color-coral-600)";
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setMobile(mq.matches);
    const h = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return mobile;
}

const EMPTY_FORM: CreateGoalDto = {
  name: "", type: "SAVINGS", targetAmount: 0,
  currentAmount: 0, targetDate: null, monthlyContribution: null, description: null,
};

/* ─── Goal Card ─────────────────────────────────────────────── */
function GoalCard({
  goal, onContribute, onEdit, onDelete,
}: {
  goal: Goal;
  onContribute: (g: Goal) => void;
  onEdit: (g: Goal) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ti = typeInfo(goal.type);
  const Icon = ti.icon;
  const pct = Math.min(goal.progress, 100);
  const hasMilestones = goal.milestones.length > 0;

  return (
    <div
      className="card flex flex-col gap-3"
      style={{ opacity: goal.isCompleted ? 0.75 : 1 }}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: ti.color + "22" }}
        >
          <Icon size={20} style={{ color: ti.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-fg truncate">{goal.name}</span>
            {goal.isCompleted && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "var(--color-sage-100)", color: "var(--color-sage-700)" }}>
                Completed
              </span>
            )}
          </div>
          <span className="text-xs text-fg-muted">{ti.label}</span>
        </div>
        {!goal.isCompleted && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => onEdit(goal)}
              className="p-1.5 rounded-lg text-fg-soft hover:text-fg transition-colors hover:bg-black/5">
              <Edit2 size={14} />
            </button>
            <button onClick={() => onDelete(goal.id)}
              className="p-1.5 rounded-lg text-fg-soft hover:text-coral-600 transition-colors hover:bg-black/5">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-base font-semibold number text-fg">
            {fmtCompact(goal.currentAmount)}
          </span>
          <span className="text-xs text-fg-muted number">
            {fmtCompact(goal.targetAmount)} target · {pct.toFixed(0)}%
          </span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${pct}%`, backgroundColor: goal.isCompleted ? "var(--color-sage-600)" : scoreColor(pct) }}
          />
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-4 flex-wrap">
        {goal.targetDate && (
          <div className="flex items-center gap-1 text-xs text-fg-muted">
            <Calendar size={12} />
            <span>{shortDate(goal.targetDate)}</span>
          </div>
        )}
        {goal.monthlyContribution != null && goal.monthlyContribution > 0 && (
          <div className="flex items-center gap-1 text-xs text-fg-muted">
            <DollarSign size={12} />
            <span>{fmt(goal.monthlyContribution)}/mo</span>
          </div>
        )}
        {goal.description && (
          <span className="text-xs text-fg-muted truncate flex-1">{goal.description}</span>
        )}
      </div>

      {/* Milestones */}
      {hasMilestones && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg transition-colors"
          >
            <Flag size={12} />
            <span>{goal.milestones.length} milestone{goal.milestones.length !== 1 ? "s" : ""}</span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {goal.milestones.map((m: GoalMilestone) => (
                <div key={m.id} className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0"
                    style={{
                      borderColor: m.isReached ? "var(--color-sage-600)" : "var(--color-border-strong)",
                      backgroundColor: m.isReached ? "var(--color-sage-600)" : "transparent",
                    }}
                  >
                    {m.isReached && <Check size={9} color="#fff" strokeWidth={3} />}
                  </div>
                  <span className="text-xs text-fg-muted flex-1 truncate">{m.title}</span>
                  <span className="text-xs number text-fg-soft">{fmtCompact(m.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {!goal.isCompleted && (
        <div className="pt-1 border-t border-border">
          <button
            onClick={() => onContribute(goal)}
            className="btn-secondary w-full text-xs py-2"
          >
            <Plus size={13} /> Add Contribution
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Goal Modal ────────────────────────────────────────────── */
function GoalModal({
  initial,
  onClose,
  onSave,
  loading,
}: {
  initial: CreateGoalDto & { id?: string };
  onClose: () => void;
  onSave: (dto: CreateGoalDto & { id?: string }) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const isEdit = !!initial.id;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full rounded-2xl bg-surface border border-border p-5 flex flex-col gap-4 animate-slide-up"
        style={{ maxWidth: "28rem", maxHeight: "90dvh", overflowY: "auto" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="heading-serif text-lg text-fg">{isEdit ? "Edit Goal" : "New Goal"}</h2>
          <button onClick={onClose} className="text-fg-soft hover:text-fg p-1"><X size={18} /></button>
        </div>

        {/* Name */}
        <div>
          <label className="label">Goal name *</label>
          <input className="input" placeholder="e.g. Vacation Fund" value={form.name}
            onChange={(e) => set("name", e.target.value)} />
        </div>

        {/* Type */}
        <div>
          <label className="label">Type *</label>
          <select className="input" value={form.type} onChange={(e) => set("type", e.target.value)}>
            {GOAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Amounts row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label className="label">Target amount *</label>
            <input className="input" type="number" min="1" placeholder="100000"
              value={form.targetAmount || ""}
              onChange={(e) => set("targetAmount", parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className="label">Current amount</label>
            <input className="input" type="number" min="0" placeholder="0"
              value={form.currentAmount || ""}
              onChange={(e) => set("currentAmount", parseFloat(e.target.value) || 0)} />
          </div>
        </div>

        {/* Contribution + Target Date */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label className="label">Monthly contribution</label>
            <input className="input" type="number" min="0" placeholder="5000"
              value={form.monthlyContribution ?? ""}
              onChange={(e) => set("monthlyContribution", e.target.value ? parseFloat(e.target.value) : null)} />
          </div>
          <div>
            <label className="label">Target date</label>
            <input className="input" type="date"
              value={form.targetDate ?? ""}
              onChange={(e) => set("targetDate", e.target.value || null)} />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="label">Description</label>
          <textarea
            className="input resize-none"
            rows={2}
            placeholder="Optional notes about this goal"
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value || null)}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary flex-1"
            disabled={loading || !form.name || !form.targetAmount}
            onClick={() => onSave(form)}
          >
            {loading ? "Saving…" : isEdit ? "Update Goal" : "Create Goal"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Contribute Modal ───────────────────────────────────────── */
function ContributeModal({
  goal, onClose, onSave, loading,
}: {
  goal: Goal;
  onClose: () => void;
  onSave: (amount: number) => void;
  loading: boolean;
}) {
  const [amount, setAmount] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full rounded-2xl bg-surface border border-border p-5 flex flex-col gap-4 animate-slide-up"
        style={{ maxWidth: "24rem" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="heading-serif text-lg text-fg">Add Contribution</h2>
          <button onClick={onClose} className="text-fg-soft hover:text-fg p-1"><X size={18} /></button>
        </div>

        <div className="rounded-xl p-3 border border-border" style={{ backgroundColor: "var(--color-bg)" }}>
          <p className="text-xs text-fg-muted mb-0.5">{goal.name}</p>
          <p className="text-sm font-semibold text-fg number">
            {fmt(goal.currentAmount)} / {fmt(goal.targetAmount)}
            <span className="ml-2 text-xs font-normal text-fg-muted">({goal.progress.toFixed(0)}%)</span>
          </p>
        </div>

        <div>
          <label className="label">Amount to add</label>
          <input
            className="input"
            type="number"
            min="1"
            placeholder="e.g. 5000"
            value={amount}
            autoFocus
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && amount && onSave(parseFloat(amount))}
          />
          {amount && !isNaN(parseFloat(amount)) && (
            <p className="text-xs text-fg-muted mt-1.5">
              New total: {fmt(goal.currentAmount + parseFloat(amount))}
              {" "}({Math.min(100, ((goal.currentAmount + parseFloat(amount)) / goal.targetAmount * 100)).toFixed(0)}%)
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary flex-1"
            disabled={loading || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
            onClick={() => onSave(parseFloat(amount))}
          >
            {loading ? "Saving…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */
export default function GoalsPage() {
  const mobile = useIsMobile();
  const qc = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [contributeGoal, setContributeGoal] = useState<Goal | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ["goals"],
    queryFn: goalsApi.list,
  });

  const createMut = useMutation({
    mutationFn: goalsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["goals"] }); setShowModal(false); toast.success("Goal created!"); },
    onError: () => toast.error("Failed to create goal"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Parameters<typeof goalsApi.update>[1] }) =>
      goalsApi.update(id, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["goals"] }); setEditGoal(null); setContributeGoal(null); toast.success("Goal updated!"); },
    onError: () => toast.error("Failed to update goal"),
  });

  const deleteMut = useMutation({
    mutationFn: goalsApi.remove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["goals"] }); toast.success("Goal deleted"); },
    onError: () => toast.error("Failed to delete goal"),
  });

  const active = goals.filter((g) => !g.isCompleted);
  const completed = goals.filter((g) => g.isCompleted);

  const totalSaved = active.reduce((s, g) => s + g.currentAmount, 0);
  const totalTarget = active.reduce((s, g) => s + g.targetAmount, 0);
  const overallPct = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  function handleSaveGoal(form: CreateGoalDto & { id?: string }) {
    if (form.id) {
      updateMut.mutate({ id: form.id, dto: form });
    } else {
      createMut.mutate(form);
    }
  }

  function handleContribute(amount: number) {
    if (!contributeGoal) return;
    updateMut.mutate({
      id: contributeGoal.id,
      dto: { currentAmount: contributeGoal.currentAmount + amount },
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this goal? This cannot be undone.")) return;
    deleteMut.mutate(id);
  }

  return (
    <div style={{ width: "100%" }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="heading-serif text-fg" style={{ fontSize: mobile ? "1.5rem" : "1.875rem" }}>Goals</h1>
          {active.length > 0 && (
            <p className="text-xs text-fg-muted mt-0.5">
              {fmt(totalSaved)} saved of {fmt(totalTarget)} across {active.length} active goal{active.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <button className="btn-primary gap-2 text-sm" onClick={() => setShowModal(true)}>
          <Plus size={16} /> New Goal
        </button>
      </div>

      {/* Overall progress bar */}
      {active.length > 1 && (
        <div className="card mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-fg">Overall progress</span>
            <span className="text-sm number text-fg-muted">{overallPct.toFixed(0)}%</span>
          </div>
          <div className="progress-bar" style={{ height: "0.625rem" }}>
            <div className="progress-fill" style={{ width: `${overallPct}%`, backgroundColor: scoreColor(overallPct) }} />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && goals.length === 0 && (
        <div className="card text-center py-12">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ backgroundColor: "var(--color-sage-100)" }}>
            <Target size={24} style={{ color: "var(--color-sage-700)" }} />
          </div>
          <h3 className="heading-serif text-lg text-fg mb-2">No goals yet</h3>
          <p className="text-sm text-fg-muted mb-5 max-w-xs mx-auto">
            Set financial goals to track your progress toward what matters most.
          </p>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={15} /> Create your first goal
          </button>
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2, 1fr)", gap: "1rem" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse flex flex-col gap-3" style={{ minHeight: "12rem" }}>
              <div className="flex items-center gap-3">
                <div className="skeleton w-10 h-10 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-4 w-32 rounded" />
                  <div className="skeleton h-3 w-20 rounded" />
                </div>
              </div>
              <div className="skeleton h-2 rounded-full w-full" />
              <div className="skeleton h-3 w-1/2 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Active goals grid */}
      {active.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2, 1fr)", gap: "1rem" }}>
          {active.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onContribute={setContributeGoal}
              onEdit={(g) => setEditGoal(g)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Completed goals */}
      {completed.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 text-sm text-fg-muted hover:text-fg transition-colors mb-3"
          >
            <Check size={15} style={{ color: "var(--color-sage-600)" }} />
            <span>Completed ({completed.length})</span>
            {showCompleted ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showCompleted && (
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2, 1fr)", gap: "1rem" }}>
              {completed.map((g) => (
                <GoalCard key={g.id} goal={g} onContribute={() => {}} onEdit={() => {}} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {(showModal || editGoal) && (
        <GoalModal
          initial={editGoal ? { ...editGoal, id: editGoal.id } : EMPTY_FORM}
          onClose={() => { setShowModal(false); setEditGoal(null); }}
          onSave={handleSaveGoal}
          loading={createMut.isPending || updateMut.isPending}
        />
      )}

      {contributeGoal && (
        <ContributeModal
          goal={contributeGoal}
          onClose={() => setContributeGoal(null)}
          onSave={handleContribute}
          loading={updateMut.isPending}
        />
      )}
    </div>
  );
}
