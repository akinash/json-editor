import { useEffect, useMemo, useState } from "react";
import { ThemeMode } from "@/design/tokens";

const STORAGE_KEY = "theme-mode-preference";

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    return saved === "light" || saved === "dark" || saved === "system"
      ? saved
      : "system";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const resolvedMode = useMemo<"light" | "dark">(() => {
    if (mode === "light" || mode === "dark") {
      return mode;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    return mq.matches ? "dark" : "light";
  }, [mode]);

  const label =
    mode === "system"
      ? `Системная (${resolvedMode === "dark" ? "тёмная" : "светлая"})`
      : mode === "dark"
      ? "Тёмная"
      : "Светлая";

  return { mode, resolvedMode, setMode, label };
}
