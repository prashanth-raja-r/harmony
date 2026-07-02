import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Users, Plus, X, UserPlus, Shield, Crown, LogOut,
  Trash2, ChevronRight, ChevronLeft, Mail, Check, UserMinus,
  Lock, UserCheck, BarChart2, TrendingUp, TrendingDown, Target, Award,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuthStore } from "@/store/authStore";
import { spacesApi } from "@/api/spaces";
import type { Space, SpaceMemberItem, PendingInvite, SpaceDashboard, SpaceDashboardMember } from "@/types";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(n: number, symbol: string) {
  return `${symbol}${Math.abs(n).toLocaleString("en-IN")}`;
}

function scoreColor(s: number) {
  if (s >= 80) return { bg: "bg-emerald-100", text: "text-emerald-700" };
  if (s >= 60) return { bg: "bg-blue-100", text: "text-blue-700" };
  if (s >= 40) return { bg: "bg-amber-100", text: "text-amber-700" };
  return { bg: "bg-red-100", text: "text-red-700" };
}

// ─── Space Dashboard ──────────────────────────────────────────────────────────

function MemberDashCard({ m, symbol }: { m: SpaceDashboardMember; symbol: string }) {
  const nwPositive = m.netWorth >= 0;
  const savPositive = m.monthlySavings >= 0;
  const sc = m.harmonyScore !== null ? scoreColor(m.harmonyScore) : null;

  return (
    <div className="card space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ backgroundColor: m.role === "ADMIN" ? "#6C63FF" : "#10B981" }}
        >
          {(m.name ?? m.email).slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-fg truncate">{m.name ?? m.email}</p>
            {m.isCurrentUser && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-sage/20 text-sage font-medium">you</span>
            )}
          </div>
          {m.name && <p className="text-[11px] text-fg-muted truncate">{m.email}</p>}
        </div>
        {sc && m.harmonyScore !== null && (
          <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${sc.bg} ${sc.text} flex-shrink-0`}>
            <Award size={11} />
            {m.harmonyScore}
          </div>
        )}
      </div>

      {/* 4 stats */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-xl p-2" style={{ background: "var(--color-bg-elevated)" }}>
          <p className="text-[9px] uppercase tracking-wide text-fg-muted font-semibold mb-0.5">Income</p>
          <p className="text-xs font-bold text-emerald-600">{fmt(m.monthlyIncome, symbol)}</p>
          <p className="text-[9px] text-fg-soft">/mo</p>
        </div>
        <div className="rounded-xl p-2" style={{ background: "var(--color-bg-elevated)" }}>
          <p className="text-[9px] uppercase tracking-wide text-fg-muted font-semibold mb-0.5">Debt</p>
          <p className="text-xs font-bold text-red-500">{fmt(m.totalDebt, symbol)}</p>
          <p className="text-[9px] text-fg-soft">total</p>
        </div>
        <div className="rounded-xl p-2" style={{ background: "var(--color-bg-elevated)" }}>
          <p className="text-[9px] uppercase tracking-wide text-fg-muted font-semibold mb-0.5">Spent</p>
          <p className="text-xs font-bold text-amber-600">{fmt(m.monthlySpend, symbol)}</p>
          <p className="text-[9px] text-fg-soft">this mo</p>
        </div>
        <div className="rounded-xl p-2" style={{ background: "var(--color-bg-elevated)" }}>
          <p className="text-[9px] uppercase tracking-wide text-fg-muted font-semibold mb-0.5">Saved</p>
          <p className={`text-xs font-bold ${savPositive ? "text-emerald-600" : "text-red-500"}`}>
            {savPositive ? "" : "-"}{fmt(m.monthlySavings, symbol)}
          </p>
          <p className="text-[9px] text-fg-soft">this mo</p>
        </div>
      </div>

      {/* Net worth + goals */}
      <div className="flex items-center gap-3">
        <div className="flex-1 rounded-xl px-3 py-2 flex items-center justify-between" style={{ background: "var(--color-bg-elevated)" }}>
          <span className="text-[10px] text-fg-muted font-medium">Net Worth</span>
          <span className={`text-xs font-bold flex items-center gap-0.5 ${nwPositive ? "text-emerald-600" : "text-red-500"}`}>
            {nwPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {nwPositive ? "" : "-"}{fmt(m.netWorth, symbol)}
          </span>
        </div>
        {m.goals.count > 0 && (
          <div className="flex-1 rounded-xl px-3 py-2" style={{ background: "var(--color-bg-elevated)" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-fg-muted font-medium flex items-center gap-1">
                <Target size={9} /> Goals · {m.goals.count}
              </span>
              <span className="text-[10px] font-bold text-fg">{m.goals.progress}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(m.goals.progress, 100)}%`, background: "var(--c-from)" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SpaceDashboardView({ space, symbol }: { space: Space; symbol: string }) {
  const { data, isLoading } = useQuery<SpaceDashboard>({
    queryKey: ["space-dashboard", space.id],
    queryFn: () => spacesApi.getDashboard(space.id),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center py-12 text-fg-muted text-sm">
        Loading dashboard…
      </div>
    );
  }
  if (!data) return null;

  const { members, totals, month, year } = data;
  const monthLabel = `${MONTHS[month - 1]} ${year}`;
  const nwPos = totals.combinedNetWorth >= 0;
  const savPos = totals.combinedMonthlySavings >= 0;
  const sc = totals.avgHarmonyScore !== null ? scoreColor(totals.avgHarmonyScore) : null;

  return (
    <div className="space-y-4">
      {/* Combined space totals card */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Space totals · {monthLabel}
          </p>
          {sc && totals.avgHarmonyScore !== null && (
            <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${sc.bg} ${sc.text}`}>
              <Award size={11} /> Avg score {totals.avgHarmonyScore}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Combined Income", value: totals.combinedMonthlyIncome, sub: "/mo", color: "text-emerald-600" },
            { label: "Combined Debt", value: totals.combinedTotalDebt, sub: "total", color: "text-red-500" },
            { label: "This Month Spend", value: totals.combinedMonthlySpend, sub: monthLabel, color: "text-amber-600" },
            {
              label: "Monthly Savings",
              value: totals.combinedMonthlySavings,
              sub: savPos ? "surplus" : "deficit",
              color: savPos ? "text-emerald-600" : "text-red-500",
            },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="rounded-xl p-3" style={{ background: "var(--color-bg-elevated)" }}>
              <p className="text-[10px] text-fg-muted font-medium mb-1">{label}</p>
              <p className={`text-base font-bold ${color}`}>{fmt(value, symbol)}</p>
              <p className="text-[10px] text-fg-soft">{sub}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-fg-muted">Combined Net Worth</span>
          <span className={`text-sm font-bold flex items-center gap-1 ${nwPos ? "text-emerald-600" : "text-red-500"}`}>
            {nwPos ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {nwPos ? "" : "-"}{fmt(totals.combinedNetWorth, symbol)}
          </span>
        </div>
      </div>

      {/* Per-member cards */}
      <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
        Members · {members.length}
      </p>
      {members.map((m) => (
        <MemberDashCard key={m.userId} m={m} symbol={symbol} />
      ))}
    </div>
  );
}

const SPACE_TYPES = [
  {
    value: "PERSONAL",
    label: "Personal",
    desc: "Just for you — no invites",
    emoji: "👤",
    color: "#6C63FF",
    badge: "bg-violet-100 text-violet-700",
  },
  {
    value: "FRIENDS",
    label: "Friends",
    desc: "Track shared expenses with friends",
    emoji: "🤝",
    color: "#10B981",
    badge: "bg-emerald-100 text-emerald-700",
  },
  {
    value: "FAMILY",
    label: "Family",
    desc: "Family budget & finance visibility",
    emoji: "🏡",
    color: "#F59E0B",
    badge: "bg-amber-100 text-amber-700",
  },
  {
    value: "CUSTOM",
    label: "Custom",
    desc: "Your own named space",
    emoji: "✨",
    color: "#EC4899",
    badge: "bg-pink-100 text-pink-700",
  },
] as const;

function typeMeta(type: string) {
  return SPACE_TYPES.find((t) => t.value === type) ?? SPACE_TYPES[3];
}

function initials(name: string | null, email: string | null) {
  if (name) return name.slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return "??";
}

// ─── Create Space Modal ───────────────────────────────────────────────────────

function CreateSpaceModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<string>("FRIENDS");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: () => spacesApi.create({ name: name.trim(), type, description: description.trim() || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["spaces"] });
      toast.success("Space created");
      onClose();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message ?? "Failed to create space");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="card w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-fg text-lg">New Finspace</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={18} /></button>
        </div>

        <p className="text-xs text-fg-muted mb-3">Space type</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {SPACE_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => { setType(t.value); if (!name) setName(t.label); }}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                type === t.value
                  ? "border-sage bg-sage-50"
                  : "border-border hover:border-fg-muted"
              }`}
            >
              <span className="text-2xl">{t.emoji}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">{t.label}</p>
                <p className="text-[11px] text-fg-muted leading-tight">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>

        <label className="block mb-1 text-xs text-fg-muted">Name</label>
        <input
          className="input mb-3 w-full"
          placeholder="e.g. Weekend Squad"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
        />

        <label className="block mb-1 text-xs text-fg-muted">Description (optional)</label>
        <textarea
          className="input mb-5 w-full resize-none"
          rows={2}
          placeholder="What's this space for?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
        />

        <button
          className="btn-primary w-full"
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Creating…" : "Create Space"}
        </button>
      </div>
    </div>
  );
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ space, onClose }: { space: Space; onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");

  const invite = useMutation({
    mutationFn: () => spacesApi.invite(space.id, email.trim().toLowerCase()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["spaces"] });
      void qc.invalidateQueries({ queryKey: ["space", space.id] });
      toast.success("Invite sent");
      setEmail("");
      onClose();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message ?? "Failed to send invite");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="card w-full max-w-sm animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-fg">Invite to {space.name}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={18} /></button>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-xl bg-bg-elevated mb-4">
          <Mail size={16} className="text-fg-muted flex-shrink-0" />
          <p className="text-xs text-fg-muted">Enter the email address of a registered Harmony user.</p>
        </div>

        <label className="block mb-1 text-xs text-fg-muted">Email address</label>
        <input
          type="email"
          className="input mb-4 w-full"
          placeholder="friend@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && email.includes("@") && invite.mutate()}
        />

        <button
          className="btn-primary w-full"
          disabled={!email.includes("@") || invite.isPending}
          onClick={() => invite.mutate()}
        >
          {invite.isPending ? "Sending…" : "Send Invite"}
        </button>
      </div>
    </div>
  );
}

// ─── Member Row ───────────────────────────────────────────────────────────────

function MemberRow({
  member,
  space,
  isMe,
  canManage,
  onRoleChange,
  onRemove,
}: {
  member: SpaceMemberItem;
  space: Space;
  isMe: boolean;
  canManage: boolean;
  onRoleChange: (m: SpaceMemberItem, role: string) => void;
  onRemove: (m: SpaceMemberItem) => void;
}) {
  const isOwner = member.userId === space.ownerId;
  const isPending = member.status === "PENDING";

  return (
    <div className={`flex items-center gap-3 py-2.5 ${isPending ? "opacity-70" : ""}`}>
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 text-white"
        style={{ backgroundColor: isOwner ? "#6C63FF" : "#94A3B8" }}
      >
        {initials(member.name, member.email)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-fg truncate">
          {member.name ?? member.email}
          {isMe && <span className="ml-1 text-[10px] text-fg-muted">(you)</span>}
        </p>
        {member.name && <p className="text-[11px] text-fg-muted truncate">{member.email}</p>}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isPending && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">pending</span>
        )}
        {isOwner ? (
          <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
            <Crown size={9} /> owner
          </span>
        ) : member.role === "ADMIN" ? (
          <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
            <Shield size={9} /> admin
          </span>
        ) : null}

        {canManage && !isOwner && (
          <div className="flex items-center gap-1">
            {member.role === "MEMBER" ? (
              <button
                title="Promote to admin"
                onClick={() => onRoleChange(member, "ADMIN")}
                className="p-1 rounded hover:bg-bg-elevated transition-colors"
              >
                <Shield size={13} className="text-fg-muted hover:text-blue-600" />
              </button>
            ) : (
              <button
                title="Demote to member"
                onClick={() => onRoleChange(member, "MEMBER")}
                className="p-1 rounded hover:bg-bg-elevated transition-colors"
              >
                <UserCheck size={13} className="text-fg-muted hover:text-fg" />
              </button>
            )}
            <button
              title="Remove from space"
              onClick={() => onRemove(member)}
              className="p-1 rounded hover:bg-bg-elevated transition-colors"
            >
              <UserMinus size={13} className="text-fg-muted hover:text-coral" />
            </button>
          </div>
        )}

        {isMe && !isOwner && (
          <button
            title="Leave space"
            onClick={() => onRemove(member)}
            className="p-1 rounded hover:bg-bg-elevated transition-colors"
          >
            <LogOut size={13} className="text-fg-muted hover:text-coral" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Space Detail Panel ───────────────────────────────────────────────────────

function SpaceDetail({
  space,
  onBack,
  onDeleted,
  symbol,
}: {
  space: Space;
  onBack: () => void;
  onDeleted: () => void;
  symbol: string;
}) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "members">("dashboard");
  const isAdmin = space.myRole === "ADMIN";
  const isOwner = space.ownerId === user?.id;
  const meta = typeMeta(space.type);

  const roleChange = useMutation({
    mutationFn: ({ m, role }: { m: SpaceMemberItem; role: string }) =>
      spacesApi.updateMemberRole(space.id, m.userId!, role),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["spaces"] });
      toast.success("Role updated");
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? "Failed to update role"),
  });

  const removeMember = useMutation({
    mutationFn: (m: SpaceMemberItem) => spacesApi.removeMember(space.id, m.userId!),
    onSuccess: (_, m) => {
      void qc.invalidateQueries({ queryKey: ["spaces"] });
      if (m.userId === user?.id) {
        toast.success("You left the space");
        onDeleted();
      } else {
        toast.success("Member removed");
      }
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? "Failed to remove member"),
  });

  const cancelInvite = useMutation({
    mutationFn: (m: SpaceMemberItem) => spacesApi.cancelInvite(space.id, m.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["spaces"] });
      toast.success("Invite cancelled");
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? "Failed to cancel invite"),
  });

  const deleteSpace = useMutation({
    mutationFn: () => spacesApi.remove(space.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["spaces"] });
      toast.success("Space deleted");
      onDeleted();
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? "Failed to delete space"),
  });

  const accepted = space.members.filter((m) => m.status === "ACCEPTED");
  const pending = space.members.filter((m) => m.status === "PENDING");

  return (
    <>
      {inviteOpen && <InviteModal space={space} onClose={() => setInviteOpen(false)} />}

      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn-ghost p-1.5 rounded-lg sm:hidden">
            <ChevronLeft size={18} />
          </button>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ backgroundColor: meta.color + "22" }}
          >
            {meta.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-fg text-lg truncate">{space.name}</h2>
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${meta.badge}`}>
              {meta.label}
            </span>
          </div>
          {isAdmin && space.type !== "PERSONAL" && (
            <button
              onClick={() => setInviteOpen(true)}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <UserPlus size={14} /> Invite
            </button>
          )}
        </div>

        {space.description && (
          <p className="text-sm text-fg-muted">{space.description}</p>
        )}

        {/* Tabs */}
        {space.type !== "PERSONAL" && (
          <div className="flex rounded-xl overflow-hidden border border-border">
            {([
              { key: "dashboard", label: "Dashboard", icon: <BarChart2 size={13} /> },
              { key: "members",   label: "Members",   icon: <Users size={13} /> },
            ] as const).map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors"
                style={activeTab === key
                  ? { background: "var(--c-from)", color: "#fff" }
                  : { background: "transparent", color: "var(--color-fg-muted)" }}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        )}

        {/* Dashboard tab */}
        {(activeTab === "dashboard" && space.type !== "PERSONAL") && (
          <SpaceDashboardView space={space} symbol={symbol} />
        )}

        {/* Members tab (or always shown for PERSONAL) */}
        {(activeTab === "members" || space.type === "PERSONAL") && (
          <>
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Members · {accepted.length}
                </p>
              </div>
              <div className="divide-y divide-border">
                {accepted.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    space={space}
                    isMe={m.userId === user?.id}
                    canManage={isAdmin && m.userId !== user?.id}
                    onRoleChange={(mem, role) => roleChange.mutate({ m: mem, role })}
                    onRemove={(mem) => removeMember.mutate(mem)}
                  />
                ))}
              </div>
            </div>

            {pending.length > 0 && (
              <div className="card">
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted mb-3">
                  Pending · {pending.length}
                </p>
                <div className="divide-y divide-border">
                  {pending.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      space={space}
                      isMe={false}
                      canManage={isAdmin}
                      onRoleChange={(mem, role) => roleChange.mutate({ m: mem, role })}
                      onRemove={(mem) => cancelInvite.mutate(mem)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Danger zone */}
            <div className="card border-coral/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted mb-3">Danger</p>
              {isOwner ? (
                <button
                  onClick={() => {
                    if (confirm(`Delete "${space.name}"? This cannot be undone.`)) {
                      deleteSpace.mutate();
                    }
                  }}
                  disabled={deleteSpace.isPending}
                  className="flex items-center gap-2 text-sm text-coral hover:text-coral/80 transition-colors"
                >
                  <Trash2 size={14} />
                  {deleteSpace.isPending ? "Deleting…" : "Delete this space"}
                </button>
              ) : (
                <button
                  onClick={() => {
                    const me = space.members.find((m) => m.userId === user?.id);
                    if (me && confirm(`Leave "${space.name}"?`)) removeMember.mutate(me);
                  }}
                  className="flex items-center gap-2 text-sm text-coral hover:text-coral/80 transition-colors"
                >
                  <LogOut size={14} /> Leave space
                </button>
              )}
            </div>

            <p className="text-[10px] text-fg-soft text-center">
              Created {formatDistanceToNow(new Date(space.createdAt), { addSuffix: true })}
            </p>
          </>
        )}
      </div>
    </>
  );
}

// ─── Space Card ───────────────────────────────────────────────────────────────

function SpaceCard({ space, selected, onClick }: { space: Space; selected: boolean; onClick: () => void }) {
  const meta = typeMeta(space.type);
  const isPending = space.myStatus === "PENDING";

  return (
    <button
      onClick={onClick}
      className={`card text-left w-full transition-all ${
        selected ? "border-sage ring-1 ring-sage/30" : "hover:border-fg-muted"
      } ${isPending ? "opacity-75" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ backgroundColor: meta.color + "22" }}
        >
          {meta.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-fg text-sm truncate">{space.name}</h3>
            {isPending && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 flex-shrink-0">invite</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${meta.badge}`}>{meta.label}</span>
            <span className="text-[11px] text-fg-muted">
              {space.type === "PERSONAL" ? "Private" : `${space.memberCount} member${space.memberCount !== 1 ? "s" : ""}`}
            </span>
            {space.type === "PERSONAL" && <Lock size={10} className="text-fg-soft" />}
          </div>
          {space.myRole === "ADMIN" && space.type !== "PERSONAL" && (
            <span className="flex items-center gap-0.5 text-[10px] text-fg-muted mt-1">
              <Shield size={9} /> admin
            </span>
          )}
        </div>
        <ChevronRight size={14} className="text-fg-muted flex-shrink-0 mt-1" />
      </div>
    </button>
  );
}

// ─── Pending Invites Banner ───────────────────────────────────────────────────

function InvitesBanner({ invites }: { invites: PendingInvite[] }) {
  const qc = useQueryClient();

  const accept = useMutation({
    mutationFn: (id: string) => spacesApi.acceptInvite(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["spaces"] });
      void qc.invalidateQueries({ queryKey: ["space-invites"] });
      toast.success("Joined space!");
    },
    onError: () => toast.error("Failed to accept invite"),
  });

  const decline = useMutation({
    mutationFn: (id: string) => spacesApi.declineInvite(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["space-invites"] });
      toast.success("Invite declined");
    },
    onError: () => toast.error("Failed to decline"),
  });

  if (!invites.length) return null;

  return (
    <div className="space-y-2 mb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted flex items-center gap-1.5">
        <Mail size={12} /> Pending invites · {invites.length}
      </p>
      {invites.map((inv) => {
        const meta = typeMeta(inv.spaceType);
        return (
          <div key={inv.id} className="card flex items-center gap-3">
            <span className="text-xl">{meta.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-fg truncate">{inv.spaceName}</p>
              <p className="text-[11px] text-fg-muted">
                Invited by {inv.invitedBy.name ?? inv.invitedBy.email} ·{" "}
                {formatDistanceToNow(new Date(inv.invitedAt), { addSuffix: true })}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => decline.mutate(inv.id)}
                disabled={decline.isPending}
                className="p-1.5 rounded-lg hover:bg-coral/10 text-coral transition-colors"
                title="Decline"
              >
                <X size={14} />
              </button>
              <button
                onClick={() => accept.mutate(inv.id)}
                disabled={accept.isPending}
                className="p-1.5 rounded-lg bg-sage text-white hover:bg-sage/90 transition-colors"
                title="Accept"
              >
                <Check size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const CURRENCIES: Record<string, string> = {
  INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", AUD: "A$", CAD: "C$",
};

export default function FinspacesPage() {
  const [selected, setSelected] = useState<Space | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const symbol = CURRENCIES[user?.currency ?? "INR"] ?? "₹";

  const { data: spaces = [], isLoading } = useQuery({
    queryKey: ["spaces"],
    queryFn: spacesApi.list,
  });

  const { data: invites = [] } = useQuery({
    queryKey: ["space-invites"],
    queryFn: spacesApi.invites,
    staleTime: 60_000,
  });

  const accepted = spaces.filter((s) => s.myStatus === "ACCEPTED");
  const pending = spaces.filter((s) => s.myStatus === "PENDING");

  // Keep selected in sync after mutations
  const liveSelected = selected ? spaces.find((s) => s.id === selected.id) ?? null : null;

  return (
    <>
      {createOpen && <CreateSpaceModal onClose={() => setCreateOpen(false)} />}

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-fg">Finspaces</h1>
            <p className="text-sm text-fg-muted">Group finance spaces for friends, family, or yourself</p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={16} /> New Space
          </button>
        </div>

        <InvitesBanner invites={invites} />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Left: list */}
          <div className={`sm:col-span-1 space-y-2 ${liveSelected ? "hidden sm:block" : ""}`}>
            {isLoading && (
              <div className="card flex items-center justify-center py-12 text-fg-muted">
                Loading…
              </div>
            )}

            {!isLoading && !accepted.length && !pending.length && (
              <div className="card py-12 flex flex-col items-center gap-3 text-center">
                <Users size={32} className="text-fg-soft" />
                <p className="text-sm text-fg-muted">No spaces yet.</p>
                <button
                  onClick={() => setCreateOpen(true)}
                  className="btn-primary text-sm flex items-center gap-1.5"
                >
                  <Plus size={14} /> Create your first space
                </button>
              </div>
            )}

            {accepted.map((s) => (
              <SpaceCard
                key={s.id}
                space={s}
                selected={liveSelected?.id === s.id}
                onClick={() => setSelected(s)}
              />
            ))}

            {pending.length > 0 && (
              <>
                <p className="text-[10px] uppercase tracking-widest text-fg-soft px-1 pt-2">Invited</p>
                {pending.map((s) => (
                  <SpaceCard
                    key={s.id}
                    space={s}
                    selected={liveSelected?.id === s.id}
                    onClick={() => setSelected(s)}
                  />
                ))}
              </>
            )}
          </div>

          {/* Right: detail */}
          <div className={`sm:col-span-2 ${!liveSelected ? "hidden sm:flex sm:items-center sm:justify-center" : ""}`}>
            {liveSelected ? (
              <SpaceDetail
                space={liveSelected}
                onBack={() => setSelected(null)}
                onDeleted={() => setSelected(null)}
                symbol={symbol}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-20 text-center">
                <Users size={36} className="text-fg-soft" />
                <p className="text-sm text-fg-muted">Select a space to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
