import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, CheckCircle2, ArrowLeft } from "lucide-react";
import { authApi } from "@/api/auth";

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
          <div
            key={i}
            className="flex-1 h-1 rounded-full transition-all duration-300"
            style={{ backgroundColor: i < score ? color : "var(--color-border)" }}
          />
        ))}
      </div>
      <p className="text-[11px]" style={{ color }}>{label}</p>
    </div>
  );
}

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="w-full max-w-sm card text-center">
          <p className="text-fg-muted text-sm mb-4">
            This reset link is invalid or missing. Please request a new one.
          </p>
          <Link to="/forgot-password" className="btn-primary w-full">
            Request new link
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { toast.error("Passwords don't match."); return; }
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Failed to reset password. The link may have expired.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="heading-serif text-4xl text-sage-700 mb-2">harmony</h1>
        </div>

        {done ? (
          <div className="card text-center animate-slide-up">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-sage-50 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-sage-600" />
              </div>
            </div>
            <h2 className="font-semibold text-fg text-lg mb-2">Password updated!</h2>
            <p className="text-sm text-fg-muted mb-6">
              Your password has been changed successfully. You can now sign in with your new password.
            </p>
            <button className="btn-primary w-full" onClick={() => navigate("/login")}>
              Sign in
            </button>
          </div>
        ) : (
          <div className="animate-slide-up">
            <div className="flex justify-center mb-6">
              <div className="w-14 h-14 rounded-full bg-sage-50 flex items-center justify-center">
                <KeyRound size={26} className="text-sage-600" />
              </div>
            </div>

            <h2 className="font-semibold text-fg text-xl text-center mb-2">Choose a new password</h2>
            <p className="text-sm text-fg-muted text-center mb-8">
              Make it strong and memorable.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label mb-1 block">New password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    className="input w-full pr-10"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg transition-colors"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>

              <div>
                <label className="label mb-1 block">Confirm password</label>
                <input
                  type={showPw ? "text" : "password"}
                  className={`input w-full ${confirm && confirm !== password ? "border-coral" : ""}`}
                  placeholder="Repeat new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
                {confirm && confirm !== password && (
                  <p className="text-xs text-coral mt-1">Passwords don't match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={password.length < 8 || password !== confirm || loading}
                className="btn-primary w-full mt-2"
              >
                {loading ? "Updating…" : "Set new password"}
              </button>
            </form>

            <p className="text-center text-sm text-fg-muted mt-6">
              <Link
                to="/login"
                className="flex items-center justify-center gap-1.5 text-sage-600 hover:text-sage-700 transition-colors"
              >
                <ArrowLeft size={14} /> Back to sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
