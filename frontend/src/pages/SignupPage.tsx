import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Plus, X, Check, ChevronRight, ArrowLeft } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/api/auth";
import { spacesApi } from "@/api/spaces";

const SPACE_TYPES = [
  { value: "PERSONAL", label: "Personal", emoji: "👤", desc: "Just for me, private", color: "#6C63FF" },
  { value: "FAMILY",   label: "Family",   emoji: "🏡", desc: "Share with my family", color: "#F59E0B" },
  { value: "FRIENDS",  label: "Friends",  emoji: "🤝", desc: "Track with friends",   color: "#10B981" },
  { value: "CUSTOM",   label: "Custom",   emoji: "✨", desc: "My own named space",   color: "#EC4899" },
] as const;

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const color = score <= 1 ? "#E8524A" : score <= 2 ? "#F59E0B" : score === 3 ? "#F59E0B" : "#10B981";
  const label = score <= 1 ? "Weak" : score <= 2 ? "Fair" : score === 3 ? "Good" : "Strong";
  if (!password) return null;
  return (
    <div className="mt-1.5">
      <div className="flex gap-1 mb-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
            style={{ backgroundColor: i < score ? color : "var(--color-border)" }} />
        ))}
      </div>
      <p className="text-[11px]" style={{ color }}>{label}</p>
    </div>
  );
}

function OtpInput({ onComplete }: { onComplete: (code: string) => void }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function handleChange(i: number, val: string) {
    const d = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
    if (next.every((x) => x !== "")) onComplete(next.join(""));
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) { setDigits(text.split("")); onComplete(text); refs.current[5]?.focus(); }
    e.preventDefault();
  }

  return (
    <div className="flex gap-2 justify-center my-6">
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }}
          type="text" inputMode="numeric" maxLength={1} value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="input text-center font-bold number"
          style={{ width: "3rem", height: "3.5rem", fontSize: "1.5rem",
            borderColor: d ? "var(--c-from)" : undefined }} />
      ))}
    </div>
  );
}

// Steps: 0=email, 1=otp, 2=details, 3=space, 4=members
export default function SignupPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // Step 0 – email
  const [email, setEmail] = useState("");

  // Step 1 – OTP
  const [signupToken, setSignupToken] = useState("");

  // Step 2 – account details
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  // Step 3 – space
  const [spaceType, setSpaceType] = useState<string>("PERSONAL");
  const [spaceName, setSpaceName] = useState("My Space");

  // Step 4 – members
  const [memberEmails, setMemberEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");

  const needsMembers = spaceType === "FAMILY" || spaceType === "FRIENDS";

  const canProceedDetails =
    name.trim().length >= 1 && password.length >= 8 && password === confirmPw;

  // ── Step 0: send OTP ──
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.sendOtp(email.trim(), "SIGNUP");
      setStep(1);
      toast.success("Verification code sent to your email.");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Could not send code. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 1: verify OTP ──
  async function handleVerifyOtp(code: string) {
    setLoading(true);
    try {
      const { signupToken: token } = await authApi.verifySignupOtp(email.trim(), code);
      setSignupToken(token);
      setStep(2);
      toast.success("Email verified!");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Incorrect or expired code.");
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    setResending(true);
    try {
      await authApi.sendOtp(email.trim(), "SIGNUP");
      toast.success("New code sent!");
    } catch {
      toast.error("Could not resend. Try again.");
    } finally {
      setResending(false);
    }
  }

  function addEmail() {
    const e = emailInput.trim().toLowerCase();
    if (!e.includes("@")) return;
    if (memberEmails.includes(e)) return;
    if (e === email.toLowerCase()) { toast.error("That's your own email."); return; }
    setMemberEmails((prev) => [...prev, e]);
    setEmailInput("");
  }

  // ── Final step: create account ──
  async function handleFinish() {
    setLoading(true);
    try {
      const { accessToken, user } = await authApi.signup(name.trim(), email.trim(), password, signupToken);
      setAuth(accessToken, user);

      try {
        const space = await spacesApi.create({
          name: spaceName.trim() || spaceType.charAt(0) + spaceType.slice(1).toLowerCase(),
          type: spaceType,
        });
        if (needsMembers && memberEmails.length > 0) {
          await Promise.allSettled(memberEmails.map((e) => spacesApi.invite(space.id, e)));
        }
      } catch {
        // space creation failure shouldn't block signup
      }

      logout();
      toast.success("Account created! Please log in to continue.");
      navigate("/login");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Could not create account. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const TOTAL_STEPS = needsMembers ? 5 : 4;
  const progressLabel = ["Verify email", "Confirm code", "Your details", "Your space", "Invite members"];

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="heading-serif text-4xl text-sage-700 mb-2">harmony</h1>
          <p className="text-fg-muted text-sm">Start your financial journey.</p>
        </div>

        {/* Step dots */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {Array.from({ length: needsMembers ? 5 : 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                i < step ? "bg-sage text-white" : i === step ? "bg-sage text-white scale-110" : "bg-border text-fg-muted"
              }`}>
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              {i < TOTAL_STEPS - 1 && (
                <div className={`w-6 h-0.5 rounded transition-colors ${i < step ? "bg-sage" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-center text-fg-muted mb-6">{progressLabel[step]}</p>

        {/* ── Step 0: Enter email ── */}
        {step === 0 && (
          <form onSubmit={handleSendOtp} className="space-y-4 animate-slide-up">
            <p className="text-sm font-medium text-fg">What's your email?</p>
            <div>
              <label className="label mb-1 block">Email address</label>
              <input type="email" className="input w-full" placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <p className="text-xs text-fg-muted">
              We'll send a 6-digit verification code to confirm it's you.
            </p>
            <button type="submit" disabled={loading || !email.includes("@")} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading ? "Sending…" : <><span>Send code</span> <ChevronRight size={16} /></>}
            </button>
          </form>
        )}

        {/* ── Step 1: Verify OTP ── */}
        {step === 1 && (
          <div className="animate-slide-up">
            <button onClick={() => setStep(0)} className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg mb-4 transition-colors">
              <ArrowLeft size={14} /> Back
            </button>
            <p className="text-sm text-fg-muted text-center">
              Enter the 6-digit code sent to<br />
              <strong className="text-fg">{email}</strong>
            </p>
            <OtpInput onComplete={handleVerifyOtp} />
            {loading && <p className="text-center text-sm text-fg-muted">Verifying…</p>}
            <p className="text-center text-xs text-fg-muted mt-2">
              Didn't receive it?{" "}
              <button onClick={resendOtp} disabled={resending}
                className="text-sage-600 hover:text-sage-700 font-medium transition-colors">
                {resending ? "Sending…" : "Resend code"}
              </button>
            </p>
          </div>
        )}

        {/* ── Step 2: Account details ── */}
        {step === 2 && (
          <div className="space-y-4 animate-slide-up">
            <p className="text-sm font-medium text-fg">Create your account</p>
            <div>
              <label className="label mb-1 block">Full name</label>
              <input type="text" className="input w-full" placeholder="Your name"
                value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="label mb-1 block">Password</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} className="input w-full pr-10"
                  placeholder="Min. 8 characters" value={password}
                  onChange={(e) => setPassword(e.target.value)} minLength={8} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>
            <div>
              <label className="label mb-1 block">Confirm password</label>
              <input type={showPw ? "text" : "password"}
                className={`input w-full ${confirmPw && confirmPw !== password ? "border-coral" : ""}`}
                placeholder="Repeat password" value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)} />
              {confirmPw && confirmPw !== password && (
                <p className="text-xs text-coral mt-1">Passwords don't match</p>
              )}
            </div>
            <button className="btn-primary w-full mt-2 flex items-center justify-center gap-2"
              disabled={!canProceedDetails} onClick={() => setStep(3)}>
              Continue <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step 3: Space setup ── */}
        {step === 3 && (
          <div className="animate-slide-up">
            <p className="text-sm font-medium text-fg mb-1">Set up your first space</p>
            <p className="text-xs text-fg-muted mb-5">How will you use Harmony?</p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {SPACE_TYPES.map((t) => (
                <button key={t.value}
                  onClick={() => { setSpaceType(t.value); setSpaceName(t.label + " Space"); }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-all ${
                    spaceType === t.value ? "border-sage bg-sage-50 scale-[1.02]" : "border-border hover:border-fg-muted"
                  }`}>
                  <span className="text-3xl">{t.emoji}</span>
                  <span className="text-sm font-semibold text-fg">{t.label}</span>
                  <span className="text-[11px] text-fg-muted leading-tight">{t.desc}</span>
                </button>
              ))}
            </div>
            <div className="mb-5">
              <label className="label mb-1 block">Space name</label>
              <input type="text" className="input w-full" placeholder="e.g. Kumar Family"
                value={spaceName} onChange={(e) => setSpaceName(e.target.value)} maxLength={60} />
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setStep(2)}>Back</button>
              <button className="btn-primary flex-1 flex items-center justify-center gap-2"
                onClick={() => needsMembers ? setStep(4) : handleFinish()} disabled={loading}>
                {needsMembers ? <><span>Next</span><ChevronRight size={16} /></> : loading ? "Creating…" : "Finish"}
              </button>
            </div>
            {!needsMembers && (
              <p className="text-center text-xs text-fg-muted mt-3">
                Personal spaces are private — only you can see them.
              </p>
            )}
          </div>
        )}

        {/* ── Step 4: Invite members ── */}
        {step === 4 && (
          <div className="animate-slide-up">
            <p className="text-sm font-medium text-fg mb-1">Invite people</p>
            <p className="text-xs text-fg-muted mb-5">
              Add member emails — they'll get an invite to join <strong>{spaceName}</strong>. You can also do this later.
            </p>
            <div className="flex gap-2 mb-3">
              <input type="email" className="input flex-1" placeholder="friend@example.com"
                value={emailInput} onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEmail()} />
              <button type="button" onClick={addEmail} disabled={!emailInput.includes("@")} className="btn-secondary px-3">
                <Plus size={16} />
              </button>
            </div>
            {memberEmails.length > 0 && (
              <div className="space-y-2 mb-5">
                {memberEmails.map((e) => (
                  <div key={e} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-elevated">
                    <span className="flex-1 text-sm text-fg truncate">{e}</span>
                    <button onClick={() => setMemberEmails((p) => p.filter((x) => x !== e))}
                      className="text-fg-muted hover:text-coral transition-colors"><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button className="btn-secondary flex-1" onClick={() => setStep(3)}>Back</button>
              <button className="btn-primary flex-1" onClick={handleFinish} disabled={loading}>
                {loading ? "Creating…" : memberEmails.length > 0 ? "Invite & Finish" : "Skip & Finish"}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-sm text-fg-muted mt-8">
          Already have an account?{" "}
          <Link to="/login" className="text-sage-600 hover:text-sage-700 font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
