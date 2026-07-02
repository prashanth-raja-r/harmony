import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight, ChevronLeft, Plus, Trash2, CheckCircle,
  Wallet, CreditCard, TrendingUp, Sparkles, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { onboardingApi, type OnboardDebt } from "@/api/onboarding";

const CURRENCIES = [
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "AED", symbol: "د.إ", label: "UAE Dirham" },
  { code: "SGD", symbol: "S$", label: "Singapore Dollar" },
];

const DEBT_TYPES = [
  { value: "PERSONAL_LOAN",    label: "Personal Loan" },
  { value: "HOME_LOAN",        label: "Home Loan" },
  { value: "CREDIT_CARD",      label: "Credit Card" },
  { value: "VEHICLE",          label: "Vehicle Loan" },
  { value: "EDUCATION",        label: "Education Loan" },
  { value: "CREDIT_CARD_LOAN", label: "Credit Card Loan" },
  { value: "JEWEL_LOAN",       label: "Jewel Loan" },
  { value: "OTHER",            label: "Other" },
];

const STEPS = ["Welcome", "Income", "Debts", "Done"];

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      {STEPS.map((_, i) => (
        <div key={i} style={{
          width: i === step ? "1.5rem" : "0.5rem",
          height: "0.5rem",
          borderRadius: "9999px",
          background: i <= step ? "var(--c-from)" : "var(--color-border-strong)",
          transition: "all 0.3s ease",
        }} />
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const firstName = user?.name?.split(" ")[0] ?? "there";

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [currency, setCurrency] = useState("INR");
  const [monthlyIncome, setMonthlyIncome] = useState("");

  const [debts, setDebts] = useState<OnboardDebt[]>([]);
  const [addingDebt, setAddingDebt] = useState(false);
  const [debtForm, setDebtForm] = useState<Partial<OnboardDebt & { emiOverridden?: boolean }>>({
    type: "PERSONAL_LOAN", dueDate: 5,
  });
  const [tenureUnit, setTenureUnit] = useState<"months" | "years">("months");

  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "₹";

  function calcEMI(balance: number, apr: number, termMonths: number): number {
    if (!balance || !apr || !termMonths) return 0;
    const r = apr / 12 / 100;
    if (r === 0) return Math.round(balance / termMonths);
    const emi = (balance * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
    return Math.round(emi);
  }

  function updateDebtForm(patch: Partial<typeof debtForm>) {
    setDebtForm((prev) => {
      const next = { ...prev, ...patch };
      // Auto-calculate EMI whenever balance / APR / tenure change and user hasn't overridden
      if (!next.emiOverridden && next.balance && next.apr && next.termMonths) {
        next.minimumPayment = calcEMI(Number(next.balance), Number(next.apr), Number(next.termMonths));
      }
      return next;
    });
  }

  function addDebt() {
    const d = debtForm;
    if (!d.name || !d.balance || !d.apr || !d.minimumPayment) {
      toast.error("Please fill name, balance, interest rate, and EMI");
      return;
    }
    setDebts((prev) => [...prev, {
      name: d.name!,
      type: d.type ?? "OTHER",
      balance: Number(d.balance),
      originalAmount: Number(d.originalAmount ?? d.balance),
      apr: Number(d.apr),
      minimumPayment: Number(d.minimumPayment),
      dueDate: Number(d.dueDate ?? 5),
      lender: d.lender,
      termMonths: d.termMonths ? Number(d.termMonths) : undefined,
    }]);
    setDebtForm({ type: "PERSONAL_LOAN", dueDate: 5 });
    setTenureUnit("months");
    setAddingDebt(false);
  }

  async function finish() {
    setSaving(true);
    try {
      const updated = await onboardingApi.complete({
        currency,
        monthlyIncome: Number(monthlyIncome) || 0,
        debts,
      });
      updateUser({ ...updated, isOnboarded: true });
      // Bust all cached queries so dashboard/debts pages load fresh data
      await qc.invalidateQueries();
      setStep(3);
    } catch {
      toast.error("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      minHeight: "100dvh",
      background: "var(--color-bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "34rem",
        borderRadius: "28px",
        overflow: "hidden",
        boxShadow: "0 10px 0 rgba(0,0,0,0.08), 0 24px 70px rgba(0,0,0,0.18)",
        border: "1.5px solid var(--color-border)",
      }}>

        {/* ── Gradient header banner ── */}
        <div style={{
          background: "linear-gradient(135deg, var(--c-to) 0%, var(--c-from) 60%, var(--c-from) 100%)",
          padding: "2rem 2rem 1.5rem",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Decorative circles */}
          <div style={{
            position: "absolute", top: "-2rem", right: "-2rem",
            width: "8rem", height: "8rem", borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
          }} />
          <div style={{
            position: "absolute", bottom: "-1rem", left: "30%",
            width: "5rem", height: "5rem", borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
          }} />

          {/* Logo */}
          <div className="flex items-center gap-2 mb-5" style={{ position: "relative" }}>
            <div style={{
              width: "1.75rem", height: "1.75rem", borderRadius: "8px",
              background: "rgba(255,255,255,0.25)",
              backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 900, fontSize: "0.75rem",
            }}>H</div>
            <span className="heading-serif text-white" style={{ fontSize: "1.1rem", opacity: 0.9 }}>harmony</span>
          </div>

          {/* Step title */}
          <div style={{ position: "relative" }}>
            {step === 0 && (
              <div className="animate-fade-in">
                <div style={{
                  width: "3rem", height: "3rem", borderRadius: "14px",
                  background: "rgba(255,255,255,0.2)",
                  backdropFilter: "blur(8px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: "0.75rem",
                }}>
                  <Sparkles size={20} color="#fff" />
                </div>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#fff", lineHeight: 1.2, fontFamily: "'Playfair Display', serif" }}>
                  Welcome, {firstName}!
                </h1>
                <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.875rem", marginTop: "0.375rem" }}>
                  Let's set up your finances in 2 minutes.
                </p>
              </div>
            )}
            {step === 1 && (
              <div className="animate-fade-in">
                <div style={{
                  width: "3rem", height: "3rem", borderRadius: "14px",
                  background: "rgba(255,255,255,0.2)",
                  backdropFilter: "blur(8px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: "0.75rem",
                }}>
                  <TrendingUp size={20} color="#fff" />
                </div>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", lineHeight: 1.2, fontFamily: "'Playfair Display', serif" }}>
                  Your income
                </h1>
                <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.875rem", marginTop: "0.375rem" }}>
                  Helps us calculate a realistic daily budget.
                </p>
              </div>
            )}
            {step === 2 && (
              <div className="animate-fade-in">
                <div style={{
                  width: "3rem", height: "3rem", borderRadius: "14px",
                  background: "rgba(255,255,255,0.2)",
                  backdropFilter: "blur(8px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: "0.75rem",
                }}>
                  <CreditCard size={20} color="#fff" />
                </div>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", lineHeight: 1.2, fontFamily: "'Playfair Display', serif" }}>
                  Your debts
                </h1>
                <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.875rem", marginTop: "0.375rem" }}>
                  Add loans or cards. You can skip and do this later.
                </p>
              </div>
            )}
            {step === 3 && (
              <div className="animate-fade-in">
                <div style={{
                  width: "3rem", height: "3rem", borderRadius: "14px",
                  background: "rgba(255,255,255,0.2)",
                  backdropFilter: "blur(8px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: "0.75rem",
                }}>
                  <CheckCircle size={20} color="#fff" />
                </div>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", lineHeight: 1.2, fontFamily: "'Playfair Display', serif" }}>
                  You're all set!
                </h1>
                <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.875rem", marginTop: "0.375rem" }}>
                  {debts.length > 0
                    ? `Income and ${debts.length} debt${debts.length > 1 ? "s" : ""} saved.`
                    : "Your profile is ready. Add debts anytime."}
                </p>
              </div>
            )}
          </div>

          <StepDots step={step} />
        </div>

        {/* ── Card body ── */}
        <div style={{
          background: "var(--color-surface)",
          padding: "1.75rem 2rem 2rem",
        }}>

          {/* Step 0 — Welcome features */}
          {step === 0 && (
            <div className="animate-fade-in">
              <div className="space-y-3 mb-7">
                {[
                  { icon: TrendingUp, label: "Smart budget",   text: "Daily limits based on your real income and EMIs" },
                  { icon: CreditCard, label: "Debt timeline",  text: "See exactly when you'll be debt-free" },
                  { icon: Wallet,     label: "Spend tracking", text: "Log expenses in seconds, get weekly insights" },
                ].map(({ icon: Icon, label, text }) => (
                  <div key={label} className="flex items-start gap-3 px-4 py-3 rounded-2xl"
                    style={{ background: "var(--color-bg)", border: "1.5px solid var(--color-border)" }}>
                    <div style={{
                      width: "2.25rem", height: "2.25rem", borderRadius: "10px", flexShrink: 0,
                      background: "var(--c-pill-bg)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon size={15} style={{ color: "var(--c-from)" }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-fg">{label}</p>
                      <p className="text-xs text-fg-muted mt-0.5">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn-primary w-full gap-2" onClick={() => setStep(1)}>
                Get started <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* Step 1 — Income */}
          {step === 1 && (
            <div className="animate-fade-in">
              <div className="space-y-5 mb-7">
                <div>
                  <label className="text-xs font-bold text-fg-muted uppercase tracking-wider block mb-2">
                    Currency
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                    {CURRENCIES.map((c) => (
                      <button
                        key={c.code}
                        onClick={() => setCurrency(c.code)}
                        style={{
                          padding: "0.5rem 0.25rem",
                          borderRadius: "12px",
                          border: currency === c.code
                            ? "2px solid var(--c-from)"
                            : "1.5px solid var(--color-border)",
                          background: currency === c.code ? "var(--c-pill-bg)" : "var(--color-bg)",
                          color: currency === c.code ? "var(--color-fg)" : "var(--color-fg-muted)",
                          cursor: "pointer",
                          transition: "all 0.15s",
                          textAlign: "center" as const,
                        }}
                      >
                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: currency === c.code ? "var(--c-from)" : "inherit" }}>
                          {c.symbol}
                        </div>
                        <div style={{ fontSize: "0.7rem", fontWeight: 600 }}>{c.code}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-fg-muted uppercase tracking-wider block mb-2">
                    Monthly take-home income
                  </label>
                  <div style={{ position: "relative" }}>
                    <span style={{
                      position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)",
                      color: "var(--c-from)", fontWeight: 800, fontSize: "1rem",
                    }}>{symbol}</span>
                    <input
                      type="number"
                      className="input w-full"
                      style={{ paddingLeft: "2.5rem" }}
                      placeholder="0"
                      value={monthlyIncome}
                      onChange={(e) => setMonthlyIncome(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-fg-soft mt-1.5">After tax. Leave as 0 to set up later.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button className="btn-ghost px-3" onClick={() => setStep(0)}>
                  <ChevronLeft size={18} />
                </button>
                <button className="btn-primary flex-1 gap-2" onClick={() => setStep(2)}>
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — Debts */}
          {step === 2 && (
            <div className="animate-fade-in">
              {/* Existing debts list */}
              {debts.length > 0 && (
                <div className="mb-4 space-y-2">
                  {debts.map((d, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                      style={{ background: "var(--color-bg)", border: "1.5px solid var(--color-border)" }}>
                      <div style={{
                        width: "2rem", height: "2rem", borderRadius: "8px",
                        background: "var(--c-pill-bg)", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <CreditCard size={12} style={{ color: "var(--c-from)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-fg truncate">{d.name}</p>
                        <p className="text-xs text-fg-muted">{symbol}{d.balance.toLocaleString()} · {d.apr}% APR · EMI {symbol}{d.minimumPayment.toLocaleString()}</p>
                      </div>
                      <button
                        onClick={() => setDebts((prev) => prev.filter((_, j) => j !== i))}
                        className="text-fg-soft hover:text-coral-600 p-1 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add debt inline form */}
              {addingDebt ? (
                <div className="rounded-2xl p-4 mb-4 space-y-3"
                  style={{ background: "var(--color-bg)", border: "1.5px solid var(--color-border)" }}>

                  {/* Row 1: name */}
                  <div>
                    <label className="text-xs font-bold text-fg-muted block mb-1">Debt name *</label>
                    <input className="input w-full" placeholder="e.g. SBI Personal Loan"
                      value={debtForm.name ?? ""}
                      onChange={(e) => updateDebtForm({ name: e.target.value })} />
                  </div>

                  {/* Row 2: type + lender */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-fg-muted block mb-1">Type</label>
                      <select className="input w-full"
                        value={debtForm.type ?? "PERSONAL_LOAN"}
                        onChange={(e) => updateDebtForm({ type: e.target.value })}>
                        {DEBT_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-fg-muted block mb-1">Lender (optional)</label>
                      <input className="input w-full" placeholder="e.g. HDFC"
                        value={debtForm.lender ?? ""}
                        onChange={(e) => updateDebtForm({ lender: e.target.value })} />
                    </div>
                  </div>

                  {/* Row 3: balance + original amount */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-fg-muted block mb-1">Current balance ({symbol}) *</label>
                      <input type="number" className="input w-full" placeholder="0"
                        value={debtForm.balance || ""}
                        onChange={(e) => updateDebtForm({ balance: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-fg-muted block mb-1">Original loan amount ({symbol})</label>
                      <input type="number" className="input w-full" placeholder="Same as balance"
                        value={debtForm.originalAmount || ""}
                        onChange={(e) => updateDebtForm({ originalAmount: Number(e.target.value) })} />
                    </div>
                  </div>

                  {/* Row 4: APR + tenure */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-fg-muted block mb-1">Annual interest rate (%) *</label>
                      <input type="number" className="input w-full" placeholder="e.g. 14.5" step="0.1"
                        value={debtForm.apr || ""}
                        onChange={(e) => updateDebtForm({ apr: Number(e.target.value) })} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-fg-muted">Tenure</label>
                        <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
                          {(["months", "years"] as const).map((u) => (
                            <button key={u} type="button"
                              onClick={() => {
                                if (tenureUnit === u) return;
                                setTenureUnit(u);
                                // Convert stored months ↔ years on switch
                                if (debtForm.termMonths) {
                                  const converted = u === "years"
                                    ? Math.round(debtForm.termMonths / 12)
                                    : debtForm.termMonths * 12;
                                  updateDebtForm({ termMonths: converted });
                                }
                              }}
                              className="text-[10px] font-bold px-2 py-0.5 transition-colors"
                              style={tenureUnit === u ? {
                                background: "var(--c-from)", color: "#fff",
                              } : {
                                background: "transparent", color: "var(--color-fg-muted)",
                              }}>
                              {u === "months" ? "Mo" : "Yr"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <input type="number" className="input w-full"
                        placeholder={tenureUnit === "months" ? "e.g. 36" : "e.g. 3"}
                        value={tenureUnit === "years"
                          ? Math.round((debtForm.termMonths ?? 0) / 12) || ""
                          : debtForm.termMonths || ""}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          updateDebtForm({ termMonths: tenureUnit === "years" ? val * 12 : val });
                        }} />
                      {debtForm.termMonths ? (
                        <p className="text-[10px] text-fg-soft mt-1">
                          = {tenureUnit === "years"
                            ? `${debtForm.termMonths} months`
                            : `${(debtForm.termMonths / 12).toFixed(1).replace(/\.0$/, "")} years`}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* Row 5: EMI (auto-calculated) + due date */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-fg-muted">Monthly EMI ({symbol}) *</label>
                        {debtForm.minimumPayment && !debtForm.emiOverridden && debtForm.termMonths && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ background: "var(--c-pill-bg)", color: "var(--c-from)" }}>
                            Auto-calculated
                          </span>
                        )}
                      </div>
                      <input type="number" className="input w-full" placeholder="0"
                        value={debtForm.minimumPayment || ""}
                        onChange={(e) => setDebtForm((p) => ({ ...p, minimumPayment: Number(e.target.value), emiOverridden: true }))}
                        style={!debtForm.emiOverridden && debtForm.minimumPayment ? {
                          borderColor: "var(--c-from)", background: "var(--c-pill-bg)",
                        } : {}}
                      />
                      {!debtForm.emiOverridden && !debtForm.termMonths && (
                        <p className="text-[10px] text-fg-soft mt-1">Enter tenure above to auto-calculate</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-bold text-fg-muted block mb-1">EMI due date (day)</label>
                      <input type="number" className="input w-full" placeholder="5" min={1} max={31}
                        value={debtForm.dueDate || ""}
                        onChange={(e) => updateDebtForm({ dueDate: Number(e.target.value) })} />
                    </div>
                  </div>

                  {/* EMI summary */}
                  {debtForm.minimumPayment && debtForm.balance && (
                    <div className="rounded-xl px-4 py-2.5 flex items-center justify-between"
                      style={{ background: "var(--c-pill-bg)", border: "1px solid var(--color-sage-300)" }}>
                      <span className="text-xs text-fg-muted">Monthly payment</span>
                      <span className="text-sm font-bold number" style={{ color: "var(--c-from)" }}>
                        {symbol}{Number(debtForm.minimumPayment).toLocaleString()}
                      </span>
                      {debtForm.termMonths && (
                        <span className="text-xs text-fg-muted">
                          × {debtForm.termMonths} months
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button className="btn-primary flex-1" onClick={addDebt}>Add debt</button>
                    <button className="btn-ghost" onClick={() => {
                      setAddingDebt(false);
                      setDebtForm({ type: "PERSONAL_LOAN", dueDate: 5 });
                      setTenureUnit("months");
                    }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingDebt(true)}
                  className="w-full mb-4 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all"
                  style={{
                    border: "1.5px dashed var(--color-border-strong)",
                    color: "var(--color-fg-muted)",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  <Plus size={15} /> Add a debt or loan
                </button>
              )}

              <div className="flex gap-3">
                <button className="btn-ghost px-3" onClick={() => setStep(1)}>
                  <ChevronLeft size={18} />
                </button>
                <button
                  className="btn-primary flex-1 gap-2"
                  onClick={finish}
                  disabled={saving}
                >
                  {saving ? "Saving…" : debts.length === 0 ? "Skip for now" : "Finish setup"}
                  {!saving && <ChevronRight size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Done */}
          {step === 3 && (
            <div className="animate-fade-in text-center py-2">
              <p className="text-fg-muted text-sm mb-6 leading-relaxed">
                Everything can be edited any time from the app. Your daily budget and debt timeline are ready to go.
              </p>
              <button
                className="btn-primary w-full gap-2"
                onClick={() => navigate("/", { replace: true })}
              >
                Go to dashboard <ArrowRight size={16} />
              </button>
              <p className="text-xs text-fg-soft mt-4">
                {debts.length > 0 ? `${debts.length} debt${debts.length > 1 ? "s" : ""} imported · ` : ""}
                {monthlyIncome ? `${symbol}${Number(monthlyIncome).toLocaleString()} / month` : "Income not set"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
