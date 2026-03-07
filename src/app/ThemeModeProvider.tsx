import React from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { makeTheme } from "@/design/theme";
import { useThemeMode } from "@/shared/hooks/useThemeMode";

type ThemeModeContextValue = ReturnType<typeof useThemeMode>;

const ThemeModeContext = React.createContext<ThemeModeContextValue | null>(null);

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const themeMode = useThemeMode();
  const theme = React.useMemo(
    () => makeTheme(themeMode.resolvedMode),
    [themeMode.resolvedMode],
  );

  return (
    <ThemeModeContext.Provider value={themeMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeModeContext() {
  const ctx = React.useContext(ThemeModeContext);
  if (!ctx) {
    throw new Error("useThemeModeContext must be used inside ThemeModeProvider");
  }
  return ctx;
}
