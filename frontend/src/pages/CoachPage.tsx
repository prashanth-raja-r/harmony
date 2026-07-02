import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Sparkles, AlertTriangle, Lightbulb, Trophy,
  TrendingUp, Wallet, PiggyBank, BarChart2, CircleDollarSign,
  ArrowRight, RefreshCw, MessageSquare, ChevronDown, Loader2,
} from "lucide-react";
import { coachApi } from "@/api/coach";
import type { Insight, QuestionAnswer } from "@/types";

/* ─── Shared types ───────────────────────────────────────────── */
type MainTab  = "insights" | "ask";
type FilterType = "all" | "alert" | "tip" | "win";

/* ─── Questions catalogue ────────────────────────────────────── */
const QUESTIONS = [
  { id: "which-debt-first",  label: "Which debt should I pay off first?",     icon: CircleDollarSign, color: "#F43F5E" },
  { id: "savings-rate",      label: "What's my savings rate this month?",     icon: PiggyBank,        color: "#10B981" },
  { id: "budget-status",     label: "Am I on track with my budget?",          icon: BarChart2,        color: "#F59E0B" },
  { id: "debt-free-date",    label: "When will I be debt-free?",              icon: TrendingUp,       color: "#6366F1" },
  { id: "top-spending",      label: "Where am I spending the most?",          icon: Wallet,           color: "#F59E0B" },
  { id: "monthly-interest",  label: "How much interest am I paying monthly?", icon: CircleDollarSign, color: "#F43F5E" },
  { id: "income-vs-expense", label: "How does my income compare to expenses?",icon: BarChart2,        color: "#10B981" },
  { id: "debt-progress",     label: "How much of my debt have I paid off?",   icon: TrendingUp,       color: "#6366F1" },
] as const;

type QuestionId = typeof QUESTIONS[number]["id"];

/* ─── Insight card config ────────────────────────────────────── */
const CATEGORY_ICON: Record<string, React.ElementType> = {
  spending: TrendingUp, debt: CircleDollarSign,
  savings: PiggyBank, budget: BarChart2, income: Wallet,
};
const TYPE_CONFIG = {
  alert: { label: "Alert", icon: AlertTriangle, color: "#F43F5E", border: "#F43F5E", badge: { bg: "rgba(244,63,94,0.12)", text: "#F43F5E" } },
  tip:   { label: "Tip",   icon: Lightbulb,     color: "#F59E0B", border: "#F59E0B", badge: { bg: "rgba(245,158,11,0.12)", text: "#92400E" } },
  win:   { label: "Win",   icon: Trophy,        color: "#10B981", border: "#10B981", badge: { bg: "rgba(16,185,129,0.12)", text: "#059669" } },
} as const;
const CATEGORY_LABEL: Record<string, string> = {
  spending: "Spending", debt: "Debt", savings: "Savings", budget: "Budget", income: "Income",
};

/* ─── Insight card ───────────────────────────────────────────── */
function InsightCard({ insight }: { insight: Insight }) {
  const navigate = useNavigate();
  const cfg = TYPE_CONFIG[insight.type];
  const TypeIcon = cfg.icon;
  const CatIcon = CATEGORY_ICON[insight.category] ?? Sparkles;
  return (
    <div
      style={{
        background: "var(--color-surface)", border: "1px solid var(--color-border)",
        borderLeft: `3px solid ${cfg.border}`, borderRadius: "1rem",
        padding: "1.125rem 1.25rem", display: "flex", flexDirection: "column",
        gap: "0.625rem", transition: "box-shadow 0.15s",
      }}
      className="hover:shadow-md"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 8px", borderRadius: "9999px", backgroundColor: cfg.badge.bg, color: cfg.badge.text }}>
          <TypeIcon size={10} strokeWidth={2.5} />{cfg.label}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", padding: "2px 8px", borderRadius: "9999px", backgroundColor: "var(--color-border)", color: "var(--color-fg-muted)" }}>
          <CatIcon size={10} strokeWidth={2} />{CATEGORY_LABEL[insight.category]}
        </span>
      </div>
      <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-fg)", lineHeight: 1.35 }}>{insight.title}</p>
      <p style={{ fontSize: "0.8rem", color: "var(--color-fg-muted)", lineHeight: 1.55 }}>{insight.description}</p>
      {insight.link && (
        <button onClick={() => navigate(insight.link!)} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", fontWeight: 600, color: cfg.color, background: "none", border: "none", padding: 0, cursor: "pointer", marginTop: "0.125rem" }}>
          View <ArrowRight size={12} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

/* ─── Answer panel ───────────────────────────────────────────── */
function AnswerPanel({ answer, onClose }: { answer: QuestionAnswer; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <div
      style={{
        background: "var(--color-surface)", border: "1px solid var(--color-border)",
        borderRadius: "1rem", padding: "1.25rem 1.5rem",
        display: "flex", flexDirection: "column", gap: "1rem",
        animation: "slideUp 0.25s ease-out both",
      }}
    >
      {/* Question label */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <MessageSquare size={14} style={{ color: "var(--color-sage-600)", flexShrink: 0 }} />
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-fg-muted)" }}>{answer.question}</span>
        </div>
        <button onClick={onClose} style={{ fontSize: "0.7rem", color: "var(--color-fg-soft)", background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: "2px 6px" }}>✕</button>
      </div>

      {/* Answer text */}
      <p style={{ fontSize: "0.9rem", color: "var(--color-fg)", lineHeight: 1.6, fontWeight: 450 }}>{answer.answer}</p>

      {/* Metrics */}
      {answer.metrics && answer.metrics.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(9rem, 1fr))", gap: "0.625rem" }}>
          {answer.metrics.map((m, i) => (
            <div
              key={i}
              style={{
                background: m.highlight ? "var(--color-sage-100)" : "var(--color-border)",
                borderRadius: "0.75rem", padding: "0.625rem 0.875rem",
                border: m.highlight ? "1px solid var(--color-sage-300)" : "1px solid transparent",
              }}
            >
              <p style={{ fontSize: "0.65rem", color: m.highlight ? "var(--color-sage-600)" : "var(--color-fg-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>{m.label}</p>
              <p style={{ fontSize: "0.9rem", fontWeight: 700, color: m.highlight ? "var(--color-sage-700)" : "var(--color-fg)", fontFamily: "var(--font-mono)" }}>{m.value}</p>
              {m.sub && <p style={{ fontSize: "0.65rem", color: "var(--color-fg-soft)", marginTop: "0.125rem" }}>{m.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      {answer.link && (
        <button
          onClick={() => navigate(answer.link!)}
          style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", fontWeight: 600, color: "var(--color-sage-700)", padding: "0.4rem 1rem", borderRadius: "0.625rem", border: "1px solid var(--color-sage-300)", background: "var(--color-sage-100)", cursor: "pointer" }}
        >
          View details <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}

/* ─── Single accordion question row ─────────────────────────── */
function QuestionRow({ q, isSelected, onToggle }: {
  q: typeof QUESTIONS[number];
  isSelected: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const answerRef = useRef<HTMLDivElement>(null);
  const Icon = q.icon;

  const { data: answer, isLoading } = useQuery({
    queryKey: ["coach-answer", q.id],
    queryFn: () => coachApi.answerQuestion(q.id),
    enabled: isSelected,
    staleTime: 2 * 60 * 1000,
  });

  // Scroll answer into view when it loads on mobile
  useEffect(() => {
    if (isSelected && answer && answerRef.current) {
      setTimeout(() => {
        answerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    }
  }, [isSelected, answer]);

  return (
    <div style={{ borderRadius: "0.875rem", overflow: "hidden", border: `1.5px solid ${isSelected ? q.color : "var(--color-border)"}`, transition: "border-color 0.15s" }}>
      {/* Question button */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "0.75rem",
          padding: "0.875rem 1rem", textAlign: "left",
          background: isSelected ? `${q.color}10` : "var(--color-surface)",
          cursor: "pointer", border: "none", transition: "background 0.15s",
        }}
      >
        <span style={{ width: "2rem", height: "2rem", borderRadius: "0.5rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: `${q.color}18` }}>
          <Icon size={15} style={{ color: q.color }} strokeWidth={2} />
        </span>
        <span style={{ fontSize: "0.85rem", fontWeight: 500, color: isSelected ? "var(--color-fg)" : "var(--color-fg-muted)", lineHeight: 1.35, flex: 1, textAlign: "left" }}>
          {q.label}
        </span>
        <ChevronDown
          size={15}
          style={{ color: isSelected ? q.color : "var(--color-fg-soft)", flexShrink: 0, transform: isSelected ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        />
      </button>

      {/* Inline answer */}
      {isSelected && (
        <div
          ref={answerRef}
          style={{
            borderTop: `1px solid ${q.color}30`,
            background: "var(--color-surface)",
            padding: "1rem 1rem 1.125rem",
            display: "flex", flexDirection: "column", gap: "0.875rem",
            animation: "slideUp 0.2s ease-out both",
          }}
        >
          {isLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.5rem 0" }}>
              <Loader2 size={15} className="animate-spin" style={{ color: "var(--color-sage-600)" }} />
              <span style={{ fontSize: "0.82rem", color: "var(--color-fg-muted)" }}>Analysing your data…</span>
            </div>
          ) : answer ? (
            <>
              <p style={{ fontSize: "0.875rem", color: "var(--color-fg)", lineHeight: 1.6 }}>{answer.answer}</p>

              {answer.metrics && answer.metrics.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(8rem, 1fr))", gap: "0.5rem" }}>
                  {answer.metrics.map((m, i) => (
                    <div key={i} style={{ background: m.highlight ? "var(--color-sage-100)" : "var(--color-border)", borderRadius: "0.625rem", padding: "0.5rem 0.75rem", border: m.highlight ? "1px solid var(--color-sage-300)" : "1px solid transparent" }}>
                      <p style={{ fontSize: "0.6rem", color: m.highlight ? "var(--color-sage-600)" : "var(--color-fg-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>{m.label}</p>
                      <p style={{ fontSize: "0.85rem", fontWeight: 700, color: m.highlight ? "var(--color-sage-700)" : "var(--color-fg)", fontFamily: "var(--font-mono)" }}>{m.value}</p>
                      {m.sub && <p style={{ fontSize: "0.6rem", color: "var(--color-fg-soft)", marginTop: "0.1rem" }}>{m.sub}</p>}
                    </div>
                  ))}
                </div>
              )}

              {answer.link && (
                <button
                  onClick={() => navigate(answer.link!)}
                  style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", fontWeight: 600, color: "var(--color-sage-700)", padding: "0.35rem 0.875rem", borderRadius: "0.5rem", border: "1px solid var(--color-sage-300)", background: "var(--color-sage-100)", cursor: "pointer" }}
                >
                  View details <ArrowRight size={12} />
                </button>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ─── Ask tab ────────────────────────────────────────────────── */
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

function AskTab() {
  const [selected, setSelected] = useState<QuestionId | null>(null);
  const isMobile = useIsMobile();

  const { data: answer, isLoading } = useQuery({
    queryKey: ["coach-answer", selected],
    queryFn: () => coachApi.answerQuestion(selected!),
    enabled: !!selected && !isMobile,
    staleTime: 2 * 60 * 1000,
  });

  function toggle(id: QuestionId) {
    setSelected((prev) => (prev === id ? null : id));
  }

  // ── Mobile: accordion, answer inline below each question ──────
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {QUESTIONS.map((q) => (
          <QuestionRow
            key={q.id}
            q={q}
            isSelected={selected === q.id}
            onToggle={() => toggle(q.id as QuestionId)}
          />
        ))}
      </div>
    );
  }

  // ── Desktop: grid of buttons + answer panel below ─────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(17rem, 1fr))", gap: "0.625rem" }}>
        {QUESTIONS.map((q) => {
          const Icon = q.icon;
          const active = selected === q.id;
          return (
            <button
              key={q.id}
              onClick={() => toggle(q.id as QuestionId)}
              style={{
                display: "flex", alignItems: "center", gap: "0.75rem",
                padding: "0.875rem 1rem", borderRadius: "0.875rem", textAlign: "left",
                border: `1.5px solid ${active ? q.color : "var(--color-border)"}`,
                background: active ? `${q.color}12` : "var(--color-surface)",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <span style={{ width: "2rem", height: "2rem", borderRadius: "0.5rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: `${q.color}18` }}>
                <Icon size={15} style={{ color: q.color }} strokeWidth={2} />
              </span>
              <span style={{ fontSize: "0.8rem", fontWeight: 500, color: active ? "var(--color-fg)" : "var(--color-fg-muted)", lineHeight: 1.35, flex: 1 }}>
                {q.label}
              </span>
              <ChevronDown size={14} style={{ color: active ? q.color : "var(--color-fg-soft)", flexShrink: 0, transform: active ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </button>
          );
        })}
      </div>

      {selected && (
        isLoading ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "1.5rem", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "1rem" }}>
            <Loader2 size={16} className="animate-spin" style={{ color: "var(--color-sage-600)" }} />
            <span style={{ fontSize: "0.85rem", color: "var(--color-fg-muted)" }}>Analysing your data…</span>
          </div>
        ) : answer ? (
          <AnswerPanel answer={answer} onClose={() => setSelected(null)} />
        ) : null
      )}
    </div>
  );
}

/* ─── Insights tab ───────────────────────────────────────────── */
function InsightsTab() {
  const [filter, setFilter] = useState<FilterType>("all");

  const { data: insights = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["coach-insights"],
    queryFn: coachApi.getInsights,
    staleTime: 5 * 60 * 1000,
  });

  const alerts = insights.filter(i => i.type === "alert");
  const tips   = insights.filter(i => i.type === "tip");
  const wins   = insights.filter(i => i.type === "win");
  const filtered = filter === "all" ? insights : filter === "alert" ? alerts : filter === "tip" ? tips : wins;

  const TABS: { key: FilterType; label: string; count: number; color?: string }[] = [
    { key: "all",   label: "All",    count: insights.length },
    { key: "alert", label: "Alerts", count: alerts.length,  color: "#F43F5E" },
    { key: "tip",   label: "Tips",   count: tips.length,    color: "#9E7700" },
    { key: "win",   label: "Wins",   count: wins.length,    color: "#059669" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {TABS.map(tab => {
            const active = filter === tab.key;
            return (
              <button key={tab.key} onClick={() => setFilter(tab.key)}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", fontWeight: 600, padding: "0.375rem 0.875rem", borderRadius: "9999px", border: `1.5px solid ${active ? (tab.color ?? "var(--color-sage-600)") : "var(--color-border)"}`, background: active ? (tab.color ? `${tab.color}15` : "var(--color-sage-100)") : "transparent", color: active ? (tab.color ?? "var(--color-sage-700)") : "var(--color-fg-muted)", cursor: "pointer", transition: "all 0.15s" }}
              >
                {tab.label}
                <span style={{ fontSize: "0.65rem", fontWeight: 700, background: active ? (tab.color ?? "var(--color-sage-600)") : "var(--color-border)", color: active ? "#fff" : "var(--color-fg-muted)", borderRadius: "9999px", padding: "1px 6px" }}>{tab.count}</span>
              </button>
            );
          })}
        </div>
        <button onClick={() => refetch()} disabled={isFetching}
          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", fontWeight: 500, padding: "0.4rem 0.875rem", borderRadius: "0.75rem", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-fg-muted)", cursor: isFetching ? "not-allowed" : "pointer" }}
        >
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />Refresh
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))", gap: "1rem" }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: "9rem", borderRadius: "1rem" }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
          <Sparkles size={24} style={{ color: "var(--color-fg-soft)", margin: "0 auto 0.75rem" }} />
          <p style={{ fontSize: "0.875rem", color: "var(--color-fg-muted)" }}>
            {filter === "all" ? "No insights yet — add income, budgets, and transactions to get started." : `No ${filter}s at the moment.`}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))", gap: "1rem", alignItems: "start" }}>
          {filtered.map(insight => <InsightCard key={insight.id} insight={insight} />)}
        </div>
      )}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */
export default function CoachPage() {
  const [mainTab, setMainTab] = useState<MainTab>("insights");

  const MAIN_TABS: { key: MainTab; label: string; icon: React.ElementType }[] = [
    { key: "insights", label: "Insights",  icon: Sparkles      },
    { key: "ask",      label: "Ask",       icon: MessageSquare },
  ];

  return (
    <div style={{ width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 className="heading-serif text-fg" style={{ fontSize: "1.875rem" }}>Your Coach</h1>
        <p style={{ fontSize: "0.75rem", color: "var(--color-fg-muted)", marginTop: "0.25rem" }}>
          Personalised insights and answers from your live financial data — no AI needed
        </p>
      </div>

      {/* Main tab switcher */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1.5rem", background: "var(--color-border)", borderRadius: "0.75rem", padding: "3px", width: "fit-content" }}>
        {MAIN_TABS.map(tab => {
          const active = mainTab === tab.key;
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setMainTab(tab.key)}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", fontWeight: 600, padding: "0.4rem 1.1rem", borderRadius: "0.6rem", border: "none", background: active ? "var(--color-surface)" : "transparent", color: active ? "var(--color-fg)" : "var(--color-fg-muted)", cursor: "pointer", transition: "all 0.15s", boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}
            >
              <Icon size={14} strokeWidth={2} />{tab.label}
            </button>
          );
        })}
      </div>

      {mainTab === "insights" ? <InsightsTab /> : <AskTab />}
    </div>
  );
}
