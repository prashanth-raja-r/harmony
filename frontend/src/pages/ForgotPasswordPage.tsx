import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { authApi } from "@/api/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch {
      // Always show success (backend returns 200 even for unknown emails)
      setSent(true);
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

        {sent ? (
          <div className="card text-center animate-slide-up">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-sage-50 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-sage-600" />
              </div>
            </div>
            <h2 className="font-semibold text-fg text-lg mb-2">Check your inbox</h2>
            <p className="text-sm text-fg-muted mb-6 leading-relaxed">
              If <strong>{email}</strong> is registered, you'll receive a password reset link shortly.
              Check your spam folder if it doesn't arrive in a few minutes.
            </p>
            <Link
              to="/login"
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <ArrowLeft size={15} /> Back to sign in
            </Link>
          </div>
        ) : (
          <div className="animate-slide-up">
            <div className="flex justify-center mb-6">
              <div className="w-14 h-14 rounded-full bg-sage-50 flex items-center justify-center">
                <Mail size={26} className="text-sage-600" />
              </div>
            </div>

            <h2 className="font-semibold text-fg text-xl text-center mb-2">Forgot your password?</h2>
            <p className="text-sm text-fg-muted text-center mb-8 leading-relaxed">
              Enter the email address for your account and we'll send a reset link.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label mb-1 block">Email address</label>
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

              <button
                type="submit"
                disabled={!email.includes("@") || loading}
                className="btn-primary w-full"
              >
                {loading ? "Sending…" : "Send reset link"}
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
