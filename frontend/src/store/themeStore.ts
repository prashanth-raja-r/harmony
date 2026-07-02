import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "gold-light" | "gold-dark";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const isDark = theme === "dark" || theme === "gold-dark";
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: "harmony-theme",
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    }
  )
);
