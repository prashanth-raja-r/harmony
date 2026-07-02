import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";

// Apply saved theme before first render to prevent flash
try {
  const saved = JSON.parse(localStorage.getItem("harmony-theme") || "{}");
  const theme = saved?.state?.theme ?? "light";
  document.documentElement.setAttribute("data-theme", theme);
  const isDark = theme === "dark" || theme === "gold-dark";
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
} catch {
  document.documentElement.setAttribute("data-theme", "light");
  document.documentElement.style.colorScheme = "light";
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  </StrictMode>,
);
