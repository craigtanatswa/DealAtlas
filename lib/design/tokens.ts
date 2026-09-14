/**
 * Canonical palette from docs/DESIGN.md.
 * Components should consume semantic CSS/Tailwind tokens, not these hex values.
 */
export const PALETTE = {
  navy: "#0B1F33",
  atlasBlue: "#2563EB",
  teal: "#0F9F8F",
  amber: "#D99000",
  red: "#C73A3A",
  white: "#FFFFFF",
  slate: {
    50: "#F8FAFC",
    100: "#F1F5F9",
    200: "#E2E8F0",
    500: "#64748B",
    700: "#334155",
    900: "#0F172A",
  },
} as const;

export const SEMANTIC_COLOR_TOKENS = [
  "--background",
  "--foreground",
  "--primary",
  "--primary-foreground",
  "--muted",
  "--muted-foreground",
  "--destructive",
  "--warning",
  "--success",
  "--intelligence",
  "--border",
  "--ring",
  "--card",
  "--navy",
] as const;

export const LAYOUT = {
  contentMaxWidthPx: 1280,
  spacingGridPx: 8,
} as const;
