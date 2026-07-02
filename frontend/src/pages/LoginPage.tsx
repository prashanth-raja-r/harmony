import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/api/auth";

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
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      setDigits(text.split(""));
      onComplete(text);
      refs.current[5]?.focus();
    }
    e.preventDefault();
  }

  return (
    <div className="flex gap-2 justify-center my-6">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="input text-center text-xl font-bold number"
          style={{
            width: "3rem", height: "3.5rem", fontSize: "1.5rem",
            borderColor: d ? "var(--c-from)" : undefined,
          }}
        />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.login(email, password);
      setStep("otp");
      toast.success("A 6-digit code was sent to your email.");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtp(code: string) {
    setLoading(true);
    try {
      const { accessToken, user } = await authApi.verifyLoginOtp(email, code);
      setAuth(accessToken, user);
      navigate("/");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Incorrect or expired code.");
      setLoading(false);
    }
  }

  async function resend() {
    setResending(true);
    try {
      await authApi.sendOtp(email, "LOGIN");
      toast.success("New code sent!");
    } catch {
      toast.error("Could not resend. Try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="heading-serif text-4xl text-sage-700 mb-2">harmony</h1>
          <p className="text-fg-muted text-sm">
            {step === "credentials" ? "Welcome back." : "Check your inbox."}
          </p>
        </div>

        {step === "credentials" ? (
          <form onSubmit={handleCredentials} className="space-y-4">
            <div>
              <label className="label mb-1 block">Email</label>
              <input
                type="email"
                className="input w-full"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label">Password</label>
                <Link to="/forgot-password" className="text-xs text-sage-600 hover:text-sage-700 transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  className="input w-full pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg transition-colors"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? "Verifying…" : "Continue"}
            </button>
          </form>
        ) : (
          <div className="animate-slide-up">
            <button
              onClick={() => setStep("credentials")}
              className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg mb-6 transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </button>

            <p className="text-sm text-fg-muted text-center">
              We sent a 6-digit code to<br />
              <strong className="text-fg">{email}</strong>
            </p>

            <OtpInput onComplete={handleOtp} />

            {loading && (
              <p className="text-center text-sm text-fg-muted">Verifying…</p>
            )}

            <p className="text-center text-xs text-fg-muted mt-4">
              Didn't receive it?{" "}
              <button
                onClick={resend}
                disabled={resending}
                className="text-sage-600 hover:text-sage-700 font-medium transition-colors"
              >
                {resending ? "Sending…" : "Resend code"}
              </button>
            </p>
          </div>
        )}

        <p className="text-center text-sm text-fg-muted mt-8">
          No account?{" "}
          <Link to="/signup" className="text-sage-600 hover:text-sage-700 font-medium transition-colors">
            Create one free
          </Link>
        </p>
      </div>
    </div>
  );
}
