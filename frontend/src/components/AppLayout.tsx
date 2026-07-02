import { useState, useEffect, useRef } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sun, Moon, CreditCard, Receipt, Compass, MessageCircle, LogOut,
  Target, BarChart2, Bell, X, Check, Trash2, Users,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore, type Theme } from "@/store/themeStore";
import { notificationsApi } from "@/api/notifications";
import type { AppNotification } from "@/types";

const THEME_OPTIONS: { value: Theme; label: string; isLight: boolean; accent: string }[] = [
  { value: "light",      label: "Clay Light", isLight: true,  accent: "#10B981" },
  { value: "dark",       label: "Clay Dark",  isLight: false, accent: "#10B981" },
  { value: "gold-light", label: "Gold Light", isLight: true,  accent: "#F59E0B" },
  { value: "gold-dark",  label: "Gold Dark",  isLight: false, accent: "#F59E0B" },
];

const NAV = [
  { to: "/",           icon: Sun,           label: "Today"      },
  { to: "/debts",      icon: CreditCard,    label: "Debts"      },
  { to: "/spending",   icon: Receipt,       label: "Spending"   },
  { to: "/goals",      icon: Target,        label: "Goals"      },
  { to: "/plan",       icon: Compass,       label: "Plan"       },
  { to: "/coach",      icon: MessageCircle, label: "Coach"      },
  { to: "/finspaces",  icon: Users,         label: "Finspaces"  },
] as const;

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

function ThemeToggle({ dropUp = false }: { dropUp?: boolean }) {
  const { theme, setTheme } = useThemeStore();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const current = THEME_OPTIONS.find((o) => o.value === theme) ?? THEME_OPTIONS[0]!;
  const isLight = current.isLight;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div style={{ position: "relative" }}>
      {/* Toggle switch trigger — same visual style as before */}
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Change theme"
        style={{
          position: "relative",
          width: "2.75rem",
          height: "1.5rem",
          borderRadius: "9999px",
          flexShrink: 0,
          transition: "background-color 0.3s",
          backgroundColor: isLight ? current.accent : "var(--color-fg-soft)",
          cursor: "pointer",
          border: "none",
          outline: "none",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: isLight ? "calc(100% - 1.25rem - 2px)" : "2px",
            width: "1.25rem",
            height: "1.25rem",
            borderRadius: "9999px",
            backgroundColor: "#FFFFFF",
            boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "left 0.3s",
          }}
        >
          {isLight
            ? <Sun size={10} style={{ color: current.accent }} strokeWidth={2.5} />
            : <Moon size={10} color="#6B7099" strokeWidth={2.5} />
          }
        </span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          style={{
            position: "absolute",
            ...(dropUp
              ? { bottom: "calc(100% + 8px)" }
              : { top: "calc(100% + 8px)" }),
            right: 0,
            background: "var(--color-surface)",
            border: "1.5px solid var(--color-border-strong)",
            borderRadius: "0.875rem",
            boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
            padding: "0.375rem",
            zIndex: 9999,
            minWidth: "10rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.125rem",
          }}
        >
          {THEME_OPTIONS.map((opt) => {
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => { setTheme(opt.value); setOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.45rem 0.625rem",
                  borderRadius: "0.625rem",
                  border: "none",
                  cursor: "pointer",
                  background: active ? `${opt.accent}20` : "transparent",
                  color: active ? "var(--color-fg)" : "var(--color-fg-muted)",
                  fontSize: "0.8rem",
                  fontWeight: active ? 600 : 400,
                  textAlign: "left",
                  width: "100%",
                  transition: "background 0.15s",
                }}
              >
                <span style={{
                  width: "0.625rem", height: "0.625rem", borderRadius: "50%",
                  background: opt.accent, flexShrink: 0,
                }} />
                {opt.isLight
                  ? <Sun size={12} strokeWidth={2} style={{ color: opt.accent }} />
                  : <Moon size={12} strokeWidth={2} style={{ color: opt.accent }} />
                }
                <span>{opt.label}</span>
                {active && <Check size={11} style={{ marginLeft: "auto", color: opt.accent }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Notification Panel ─────────────────────────────────────── */
function NotificationPanel({
  onClose,
  anchorRef,
  isMobile,
}: {
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  isMobile: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: notificationsApi.getAll,
  });

  const generateMut = useMutation({
    mutationFn: notificationsApi.generate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "notif-count"] }),
  });

  const markReadMut = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "notif-count"] }),
  });

  const markAllMut = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "notif-count"] }),
  });

  const deleteMut = useMutation({
    mutationFn: notificationsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "notif-count"] }),
  });

  const clearAllMut = useMutation({
    mutationFn: notificationsApi.clearAll,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "notif-count"] }),
  });

  useEffect(() => {
    generateMut.mutate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unread = notifications.filter((n) => !n.isRead).length;

  function handleClick(n: AppNotification) {
    if (!n.isRead) markReadMut.mutate(n.id);
    if (n.link) { navigate(n.link); onClose(); }
  }

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: "fixed", top: "3.75rem", right: "0.75rem", left: "0.75rem",
        zIndex: 60, maxHeight: "75dvh",
      }
    : {
        position: "fixed", top: "auto", bottom: "4.5rem", left: "0.5rem",
        width: "20rem", zIndex: 60, maxHeight: "70dvh",
      };

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        className="rounded-[20px] flex flex-col overflow-hidden animate-slide-up"
        style={{
          ...panelStyle,
          zIndex: 60,
          background: "var(--color-surface)",
          border: "1.5px solid var(--color-border)",
          boxShadow: "0 8px 0 rgba(0,0,0,0.08), 0 20px 50px rgba(0,0,0,0.14), inset 0 1px 0 var(--c-inset-hi)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell size={15} style={{ color: "var(--color-sage-600)" }} />
            <span className="text-sm font-semibold text-fg">Notifications</span>
            {unread > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "var(--color-coral-600)", color: "#fff" }}>
                {unread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <button
                onClick={() => markAllMut.mutate()}
                className="text-[11px] text-fg-muted hover:text-fg px-2 py-1 rounded-lg hover:bg-black/5 transition-colors"
              >
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={() => clearAllMut.mutate()}
                className="text-[11px] text-fg-muted hover:text-coral-600 px-2 py-1 rounded-lg hover:bg-black/5 transition-colors"
              >
                Clear all
              </button>
            )}
            <button onClick={onClose} className="p-1 text-fg-soft hover:text-fg">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {isLoading && (
            <div className="space-y-2 p-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          )}

          {!isLoading && notifications.length === 0 && (
            <div className="text-center py-10 px-4">
              <Bell size={28} className="mx-auto mb-2 text-fg-soft" />
              <p className="text-sm text-fg-muted">You&apos;re all caught up!</p>
            </div>
          )}

          {notifications.map((n: AppNotification) => (
            <div
              key={n.id}
              className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0 cursor-pointer hover:bg-black/5 transition-colors group"
              onClick={() => handleClick(n)}
              style={{ backgroundColor: n.isRead ? "transparent" : "var(--color-sage-50)" }}
            >
              {!n.isRead && (
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                  style={{ backgroundColor: "var(--color-sage-600)" }} />
              )}
              {n.isRead && <div className="w-1.5 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-fg truncate">{n.title}</p>
                <p className="text-xs text-fg-muted mt-0.5 leading-relaxed line-clamp-2">{n.message}</p>
                <p className="text-[10px] text-fg-soft mt-1">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteMut.mutate(n.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 text-fg-soft hover:text-coral-600 transition-all flex-shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ─── Bell Button ─────────────────────────────────────────────── */
function BellButton({ isMobile }: { isMobile: boolean }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const { data: countData } = useQuery({
    queryKey: ["notif-count"],
    queryFn: notificationsApi.getUnreadCount,
    refetchInterval: 60_000,
  });
  const count = countData?.count ?? 0;

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        className="relative text-fg-soft hover:text-fg transition-colors p-1.5 rounded-lg hover:bg-black/5 flex-shrink-0"
        aria-label="Notifications"
      >
        <Bell size={isMobile ? 18 : 16} />
        {count > 0 && (
          <span
            className="absolute top-0.5 right-0.5 min-w-[1rem] h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
            style={{ backgroundColor: "var(--color-coral-600)", padding: "0 3px" }}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
      {open && (
        <NotificationPanel
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}

/* ─── App Layout ─────────────────────────────────────────────── */
export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();
  const mobile = useIsMobile();
  const qc = useQueryClient();

  // Auto-generate smart notifications once per 4 hours so bell badge is always accurate
  useEffect(() => {
    const FOUR_HOURS = 4 * 60 * 60 * 1000;
    const key = "harmony_notif_gen";
    const last = Number(localStorage.getItem(key) ?? 0);
    if (Date.now() - last > FOUR_HOURS) {
      notificationsApi
        .generate()
        .then(() => {
          void qc.invalidateQueries({ queryKey: ["notif-count"] });
          localStorage.setItem(key, String(Date.now()));
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isActive = (to: string) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
  const initial = (user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen bg-bg">

      {/* Desktop sidebar */}
      {!mobile && (
        <aside
          className="fixed inset-y-0 left-0 w-64 z-30 flex flex-col"
          style={{
            background: "var(--color-surface)",
            borderRight: "1.5px solid var(--color-border)",
            boxShadow: "4px 0 0 rgba(0,0,0,0.025), 8px 0 28px rgba(0,0,0,0.06)",
          }}
        >
          {/* Brand */}
          <div className="px-6 h-16 flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0"
              style={{
                background: "linear-gradient(145deg, var(--c-from), var(--c-to))",
                boxShadow: "0 3px 0 var(--c-deep), 0 5px 12px var(--c-logo-shadow)",
              }}
            >
              H
            </div>
            <span className="heading-serif text-xl text-sage-700 tracking-tight">harmony</span>
          </div>

          {/* Primary nav */}
          <nav className="flex-1 px-3 space-y-1 overflow-y-auto pt-2">
            {NAV.map(({ to, icon: Icon, label }) => {
              const active = isActive(to);
              return (
                <NavLink
                  key={to}
                  to={to}
                  className="group flex items-center gap-3 px-3 py-2.5 text-sm font-bold transition-all duration-200"
                  style={active ? {
                    color: "var(--color-sage-700)",
                    background: "var(--c-pill-bg)",
                    borderRadius: "14px",
                    boxShadow: "0 3px 0 var(--c-nav-sh), 0 6px 14px var(--c-nav-gl), inset 0 1px 0 var(--c-inset-hi)",
                    border: "1.5px solid var(--color-sage-300)",
                  } : {
                    color: "var(--color-fg-muted)",
                    borderRadius: "14px",
                  }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)"; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = ""; }}
                >
                  <span className={`flex-shrink-0 transition-transform duration-200 ${active ? "" : "group-hover:scale-110"}`}>
                    <Icon size={17} strokeWidth={active ? 2.5 : 1.6} />
                  </span>
                  <span className="truncate">{label}</span>
                  {active && (
                    <span
                      className="ml-auto w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, var(--c-from), var(--c-to))", boxShadow: "0 1px 4px var(--c-glow35)" }}
                    />
                  )}
                </NavLink>
              );
            })}

            {/* Analytics section */}
            <div className="pt-3 mt-1">
              <p className="px-3 mb-1.5 text-[10px] font-black uppercase tracking-widest text-fg-soft">
                Analytics
              </p>
              {(() => {
                const active = isActive("/score");
                return (
                  <NavLink
                    to="/score"
                    className="group flex items-center gap-3 px-3 py-2.5 text-sm font-bold transition-all duration-200"
                    style={active ? {
                      color: "var(--color-sage-700)",
                      background: "var(--c-pill-bg)",
                      borderRadius: "14px",
                      boxShadow: "0 3px 0 var(--c-nav-sh), 0 6px 14px var(--c-nav-gl), inset 0 1px 0 var(--c-inset-hi)",
                      border: "1.5px solid var(--color-sage-300)",
                    } : {
                      color: "var(--color-fg-muted)",
                      borderRadius: "14px",
                    }}
                    onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)"; }}
                    onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = ""; }}
                  >
                    <span className={`flex-shrink-0 transition-transform duration-200 ${active ? "" : "group-hover:scale-110"}`}>
                      <BarChart2 size={17} strokeWidth={active ? 2.5 : 1.6} />
                    </span>
                    <span className="truncate">Harmony Score</span>
                    {active && (
                      <span
                        className="ml-auto w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: "linear-gradient(135deg, var(--c-from), var(--c-to))", boxShadow: "0 1px 4px var(--c-glow35)" }}
                      />
                    )}
                  </NavLink>
                );
              })()}
            </div>
          </nav>

          {/* Sidebar footer */}
          <div className="px-3 pb-4 pt-3" style={{ borderTop: "1.5px solid var(--color-border)" }}>
            <div
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-[14px] mb-1"
              style={{ background: "var(--color-bg)" }}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                style={{
                  background: "linear-gradient(145deg, #A78BFA, #7C3AED)",
                  boxShadow: "0 3px 0 #5B21B6, 0 4px 10px rgba(124,58,237,0.35)",
                }}
              >
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-fg truncate">{user?.name ?? user?.email}</p>
                <p className="text-[10px] text-fg-soft font-semibold">Personal account</p>
              </div>
            </div>
            <div className="flex items-center justify-around px-2 pt-1">
              <BellButton isMobile={false} />
              <div className="w-px h-4 bg-border flex-shrink-0" />
              <ThemeToggle dropUp={true} />
              <div className="w-px h-4 bg-border flex-shrink-0" />
              <button
                onClick={logout}
                className="text-fg-soft hover:text-coral-600 transition-colors p-1.5 rounded-xl flex-shrink-0"
                style={{ transition: "color 0.15s, background 0.15s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(244,63,94,0.08)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                aria-label="Log out"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Mobile top bar */}
      {mobile && (
        <header
          className="sticky top-0 z-30 backdrop-blur-md"
          style={{
            background: "color-mix(in srgb, var(--color-surface) 92%, transparent)",
            borderBottom: "1.5px solid var(--color-border)",
            boxShadow: "0 2px 0 rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)",
          }}
        >
          <div className="w-full px-4 h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
                style={{
                  background: "linear-gradient(145deg, var(--c-from), var(--c-to))",
                  boxShadow: "0 2px 0 var(--c-deep), 0 3px 8px var(--c-logo-shadow)",
                }}
              >H</div>
              <span className="heading-serif text-lg text-sage-700 tracking-tight">harmony</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <BellButton isMobile={true} />
              <ThemeToggle />
              <button
                onClick={logout}
                className="text-fg-soft p-1.5 rounded-xl transition-colors"
                aria-label="Log out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main content */}
      <main style={{ paddingLeft: mobile ? 0 : "16rem", minHeight: "100dvh" }}>
        <div
          style={{
            width: "100%",
            maxWidth: "100%",
            paddingLeft: mobile ? "1rem" : "1.5rem",
            paddingRight: mobile ? "1rem" : "1.5rem",
            paddingTop: "1.5rem",
            paddingBottom: mobile
              ? "calc(5rem + env(safe-area-inset-bottom))"
              : "2.5rem",
          }}
        >
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      {mobile && (
        <nav
          className="fixed bottom-0 inset-x-0 z-30"
          style={{
            background: "color-mix(in srgb, var(--color-surface) 95%, transparent)",
            backdropFilter: "blur(16px)",
            borderTop: "1.5px solid var(--color-border)",
            boxShadow: "0 -2px 0 rgba(0,0,0,0.04), 0 -6px 20px rgba(0,0,0,0.07)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <div className="flex">
            {NAV.map(({ to, icon: Icon, label }) => {
              const active = isActive(to);
              return (
                <NavLink
                  key={to}
                  to={to}
                  className="flex-1 relative flex flex-col items-center justify-center gap-0.5 transition-all duration-200"
                  style={{ height: "3.5rem", fontSize: "9px", fontWeight: active ? 800 : 600, color: active ? "var(--color-sage-600)" : "var(--color-fg-soft)" }}
                >
                  {active && (
                    <span
                      className="absolute top-0"
                      style={{
                        left: "50%", transform: "translateX(-50%)",
                        width: "2rem", height: "3px", borderRadius: "0 0 6px 6px",
                        background: "linear-gradient(135deg, var(--c-from), var(--c-to))",
                        boxShadow: "0 2px 6px var(--c-glow40)",
                      }}
                    />
                  )}
                  <div style={active ? {
                    background: "var(--c-pill-bg)",
                    borderRadius: "10px",
                    padding: "4px 10px 2px",
                    boxShadow: "0 2px 6px var(--c-nav-sh)",
                  } : { padding: "4px 10px 2px" }}>
                    <Icon size={19} strokeWidth={active ? 2.5 : 1.6} />
                  </div>
                  <span>{label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
