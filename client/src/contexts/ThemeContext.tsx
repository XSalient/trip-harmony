import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

/** What the user picked. "system" follows the OS. */
export type ThemeSetting = "light" | "dark" | "system";
/** What is actually painted. */
export type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  /** The user's setting, including "system". */
  theme: ThemeSetting;
  /** The theme actually applied right now — never "system". */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeSetting) => void;
  /** Cycles light -> dark -> system. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "theme";

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStored(fallback: ThemeSetting): ThemeSetting {
  // Private windows and blocked site data make storage throw, not just return null.
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* ignore */
  }
  return fallback;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemeSetting;
}

export function ThemeProvider({ children, defaultTheme = "system" }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeSetting>(() => readStored(defaultTheme));
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    readStored(defaultTheme) === "system" ? systemTheme() : (readStored(defaultTheme) as ResolvedTheme)
  );

  // Apply the resolved theme to <html> and keep it in sync with the OS while
  // the setting is "system".
  useEffect(() => {
    const apply = () => {
      const next: ResolvedTheme = theme === "system" ? systemTheme() : theme;
      setResolvedTheme(next);
      document.documentElement.classList.toggle("dark", next === "dark");
      document.documentElement.style.colorScheme = next;
    };

    apply();

    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = useCallback((next: ThemeSetting) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const next: ThemeSetting = prev === "light" ? "dark" : prev === "dark" ? "system" : "light";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
