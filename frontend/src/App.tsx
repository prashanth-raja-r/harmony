import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/axios";
import type { User } from "@/types";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import TodayPage from "@/pages/TodayPage";
import DebtsPage from "@/pages/DebtsPage";
import SpendingPage from "@/pages/SpendingPage";
import GoalsPage from "@/pages/GoalsPage";
import PlanPage from "@/pages/PlanPage";
import CoachPage from "@/pages/CoachPage";
import ScorePage from "@/pages/ScorePage";
import FinspacesPage from "@/pages/FinspacesPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import OnboardingPage from "@/pages/OnboardingPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  if (!token) return <Navigate to="/login" replace />;
  if (user && !user.isOnboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function OnboardingRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  if (!token) return <Navigate to="/login" replace />;
  if (user?.isOnboarded) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  if (token) return <Navigate to={user?.isOnboarded ? "/" : "/onboarding"} replace />;
  return <>{children}</>;
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);

  // On page reload the token is restored from localStorage but user is not
  // (user is never stored on disk). Re-fetch the profile before rendering.
  const [booting, setBooting] = useState(!!token && !user);

  useEffect(() => {
    if (!token || user) {
      setBooting(false);
      return;
    }
    api
      .get<User>("/auth/me")
      .then((res) => setAuth(token, res.data))
      .catch(() => logout())
      .finally(() => setBooting(false));
  }, []); // run once on mount

  if (booting) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "inherit",
        }}
      >
        <div style={{ opacity: 0.4, fontSize: "14px", letterSpacing: "0.05em" }}>
          Loading…
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/signup" element={<GuestRoute><SignupPage /></GuestRoute>} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/onboarding" element={<OnboardingRoute><OnboardingPage /></OnboardingRoute>} />
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<TodayPage />} />
          <Route path="debts" element={<DebtsPage />} />
          <Route path="spending" element={<SpendingPage />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="coach" element={<CoachPage />} />
          <Route path="score" element={<ScorePage />} />
          <Route path="finspaces" element={<FinspacesPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
