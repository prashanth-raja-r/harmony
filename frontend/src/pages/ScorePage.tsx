import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { Save, RefreshCw, Award, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { toast } from "sonner";
import { scoreApi } from "@/api/score";
import { format } from "date-fns";
import type { ScorePillar } from "@/types";

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

const GRADE = [
  { min: 85, label: "Excellent", color: "#10B981" },
  { min: 70, label: "Great",     color: "#F59E0B" },
  { min: 55, label: "Good",      color: "#F59E0B" },
  { min: 40, label: "Fair",      color: "#F59E0B" },
  { min: 0,  label: "Needs work", color: "#F43F5E" },
];

function gradeFor(score: number) {
  return GRADE.find((g) => score >= g.min) ?? GRADE[GRADE.length - 1]!;
}

/* ─── Score Ring ─────────────────────────────────────────────── */
function ScoreRing({ score, size = 160 }: { score: number; size?: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const grade = gradeFor(score);

  return (
    <div style={{ position: "relative", width: size, height: size }} className="mx-auto">
      <svg viewBox="0 0 100 100" style={{ width: size, height: size, transform: "rotate(-90deg)" }}>
        {/* Track */}
        <circle cx="50" cy="50" r={r} fill="none"
          stroke="var(--color-border-strong)" strokeWidth="9" />
        {/* Fill */}
        <circle cx="50" cy="50" r={r} fill="none"
          stroke={grade.color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 1s ease-out" }}
        />
      </svg>
      {/* Centre label */}
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <span className="number font-semibold text-fg" style={{ fontSize: size * 0.22, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: size * 0.1, color: grade.color, fontWeight: 600, marginTop: 2 }}>{grade.label}</span>
      </div>
    </div>
  );
}

/* ─── Pillar Card ────────────────────────────────────────────── */
function PillarRow({ pillar }: { pillar: ScorePillar }) {
  const grade = gradeFor(pillar.score);
  const Icon = pillar.score >= 70 ? TrendingUp : pillar.score >= 45 ? Minus : TrendingDown;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-b-0">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: grade.color + "22" }}>
        <Icon size={15} style={{ color: grade.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-fg">{pillar.label}</span>
          <span className="text-sm number font-semibold text-fg-muted">{pillar.score}/100</span>
        </div>
        <div className="progress-bar mb-1.5">
          <div className="progress-fill"
            style={{ width: `${pillar.score}%`, backgroundColor: grade.color, transition: "width 0.8s ease-out" }} />
        </div>
        <p className="text-xs text-fg-muted leading-relaxed">{pillar.reason}</p>
      </div>
    </div>
  );
}

/* ─── Custom Tooltip ──────────────────────────────────────────── */
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="text-fg-muted mb-0.5">{label}</p>
      <p className="number font-semibold text-fg">{payload[0]?.value} / 100</p>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */
export default function ScorePage() {
  const mobile = useIsMobile();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["score-latest"],
    queryFn: scoreApi.getLatest,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["score-history"],
    queryFn: () => scoreApi.history(24),
  });

  const snapshotMut = useMutation({
    mutationFn: scoreApi.snapshot,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["score-latest"] });
      qc.invalidateQueries({ queryKey: ["score-history"] });
      toast.success("Score snapshot saved!");
    },
    onError: () => toast.error("Failed to save snapshot"),
  });

  const live = data?.live;
  const stored = data?.stored;

  const chartData = history
    .slice()
    .reverse()
    .map((s) => ({
      date: format(new Date(s.date), "MMM d"),
      score: s.score,
    }));

  return (
    <div style={{ width: "100%" }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="heading-serif text-fg" style={{ fontSize: mobile ? "1.5rem" : "1.875rem" }}>
            Harmony Score
          </h1>
          <p className="text-xs text-fg-muted mt-0.5">
            Your overall financial health across 5 pillars
          </p>
        </div>
        <button
          className="btn-secondary text-sm gap-2"
          onClick={() => snapshotMut.mutate()}
          disabled={snapshotMut.isPending}
        >
          {snapshotMut.isPending
            ? <RefreshCw size={14} className="animate-spin" />
            : <Save size={14} />
          }
          {mobile ? "Save" : "Save Snapshot"}
        </button>
      </div>

      {/* Score circle + meta */}
      {isLoading ? (
        <div className="card flex flex-col items-center gap-4 py-10">
          <div className="skeleton rounded-full" style={{ width: 160, height: 160 }} />
          <div className="skeleton h-4 w-40 rounded" />
        </div>
      ) : live ? (
        <div className="card flex flex-col items-center gap-4 py-6 mb-5">
          <ScoreRing score={Math.round(live.score)} size={mobile ? 140 : 170} />
          <div className="text-center">
            <p className="text-xs text-fg-muted">
              {stored
                ? `Last saved ${format(new Date(stored.date), "MMM d, yyyy")}`
                : "No snapshot saved yet — hit Save Snapshot to track history"
              }
            </p>
          </div>

          {/* Mini pillar quick-view */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: "0.5rem",
              width: "100%",
              maxWidth: "36rem",
            }}
          >
            {[
              { key: "debtRatioScore", label: "Debt" },
              { key: "savingsScore", label: "Savings" },
              { key: "paymentScore", label: "Payments" },
              { key: "budgetScore", label: "Budget" },
              { key: "emergencyScore", label: "Emergency" },
            ].map(({ key, label }) => {
              const val = Math.round(live[key as keyof typeof live] as number);
              const g = gradeFor(val);
              return (
                <div key={key} className="text-center rounded-xl p-2 border border-border">
                  <div className="number font-semibold text-fg text-sm">{val}</div>
                  <div className="text-[10px] text-fg-muted mt-0.5">{label}</div>
                  <div className="mt-1.5 h-1 rounded-full" style={{ backgroundColor: g.color + "44" }}>
                    <div className="h-1 rounded-full" style={{ width: `${val}%`, backgroundColor: g.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Pillars breakdown */}
      {live && live.pillars.length > 0 && (
        <div className="card mb-5">
          <h2 className="text-sm font-semibold text-fg mb-1 flex items-center gap-2">
            <Award size={15} style={{ color: "var(--color-sage-600)" }} />
            Pillars breakdown
          </h2>
          <p className="text-xs text-fg-muted mb-3">Each pillar contributes to your overall score</p>
          {live.pillars.map((p, i) => (
            <PillarRow key={i} pillar={p} />
          ))}
        </div>
      )}

      {/* History chart */}
      {chartData.length > 1 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-fg mb-4">Score history</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "var(--color-fg-muted)" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: "var(--color-fg-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#F59E0B"
                strokeWidth={2}
                fill="url(#scoreGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#F59E0B", stroke: "var(--color-surface)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {chartData.length === 0 && !isLoading && (
        <div className="card text-center py-8">
          <p className="text-sm text-fg-muted">
            No history yet. Save a snapshot to start tracking your score over time.
          </p>
        </div>
      )}
    </div>
  );
}
