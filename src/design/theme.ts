import { alpha, createTheme, Theme } from "@mui/material/styles";
import { tokens } from "./tokens";

function buildPalette(mode: "light" | "dark") {
  const t = mode === "dark" ? tokens.dark : tokens.light;
  return {
    mode,
    primary: { main: t.primary, dark: t.primaryHover },
    error: { main: t.error },
    warning: { main: t.warning },
    success: { main: t.success },
    text: {
      primary: t.textPrimary,
      secondary: t.textSecondary,
    },
    background: {
      default: t.bgCanvas,
      paper: t.bgSurface,
    },
    divider: t.border,
  };
}

export function makeTheme(mode: "light" | "dark"): Theme {
  const t = mode === "dark" ? tokens.dark : tokens.light;
  return createTheme({
    palette: buildPalette(mode),
    spacing: tokens.spacing.xs,
    shape: {
      borderRadius: tokens.radius.md,
    },
    typography: {
      fontFamily: tokens.typography.fontFamily,
      h1: {
        fontSize: tokens.typography.h1.fontSize,
        lineHeight: tokens.typography.h1.lineHeight,
        fontWeight: tokens.typography.h1.fontWeight,
      },
      h2: {
        fontSize: tokens.typography.h2.fontSize,
        lineHeight: tokens.typography.h2.lineHeight,
        fontWeight: tokens.typography.h2.fontWeight,
      },
      h3: {
        fontSize: tokens.typography.h3.fontSize,
        lineHeight: tokens.typography.h3.lineHeight,
        fontWeight: tokens.typography.h3.fontWeight,
      },
      body1: {
        fontSize: tokens.typography.body.fontSize,
        lineHeight: tokens.typography.body.lineHeight,
      },
      caption: {
        fontSize: tokens.typography.caption.fontSize,
        lineHeight: tokens.typography.caption.lineHeight,
        fontWeight: tokens.typography.caption.fontWeight,
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            margin: 0,
            color: t.textPrimary,
            background:
              mode === "dark"
                ? `radial-gradient(circle at 0% 0%, ${alpha("#3b82f6", 0.22)} 0, transparent 16%),
                   radial-gradient(circle at 10% 8%, ${alpha("#0f172a", 0.92)} 0, ${t.bgCanvas} 34%, ${t.bgCanvas} 100%)`
                : `radial-gradient(circle at 0% 0%, ${alpha(t.primary, 0.16)} 0, transparent 20%),
                   radial-gradient(circle at 12% 8%, ${t.bgCanvasTop} 0, ${t.bgCanvas} 42%, ${t.bgCanvas} 100%)`,
          },
          "@media (prefers-reduced-motion: reduce)": {
            "*, *::before, *::after": {
              animation: "none !important",
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            border: `1px solid ${t.border}`,
            boxShadow: tokens.shadows.soft,
            backgroundImage: "none",
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: t.bgSurface,
            borderRadius: tokens.radius.pill,
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: t.border,
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: t.border,
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: t.primary,
              borderWidth: 1,
              boxShadow: `0 0 0 3px ${alpha(t.primary, 0.16)}`,
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            borderRadius: tokens.radius.pill,
            fontWeight: 600,
          },
          containedPrimary: {
            boxShadow: "none",
            background: `linear-gradient(135deg, ${t.primary}, ${mode === "dark" ? "#3d7dcf" : "#2a66dc"})`,
            "&:hover": {
              boxShadow: tokens.shadows.subtle,
            },
          },
        },
      },
      MuiAccordion: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.md,
            border: `1px solid ${t.border}`,
            boxShadow: tokens.shadows.subtle,
            overflow: "hidden",
            "&::before": { display: "none" },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.pill,
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.md,
          },
        },
      },
    },
  });
}
