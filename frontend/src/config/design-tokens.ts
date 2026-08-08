/**
 * Sakin Ustalık design tokens — canonical source of truth.
 *
 * These constants are referenced from tailwind.config.ts (via CSS variables
 * declared in src/app/globals.css). Do not duplicate hex values in components:
 * use Tailwind classes mapped to these tokens instead.
 *
 * Surface hierarchy (four visible levels, top to bottom):
 *   1. background       — main warm cream canvas
 *   2. chrome           — persistent shell surfaces (sidebar, topbar, mobile nav)
 *   3. surface          — primary working surface (content, lists, cards)
 *   4. surface-2        — secondary low-emphasis surface
 */

export const designTokens = {
  color: {
    background: "#F3EFE7", // linen cream
    chrome: "#FAF8F3", // warm broken-white for persistent app chrome
    surface: "#FFFDF9", // near-white working surface
    surface2: "#ECE8DF", // secondary low-emphasis surface
    border: "#D8D2C8", // slightly warmer border
    divider: "#E4DED4", // quieter warmer divider

    text: {
      primary: "#24302E",
      secondary: "#5C6966",
      muted: "#626D6A",
      inverse: "#FFFFFF",
    },

    primary: {
      DEFAULT: "#245B57", // petrol
      hover: "#1C4845",
      active: "#153634",
      muted: "#DFECE9", // visibly petrol-tinted but not saturated
      foreground: "#FFFFFF",
    },

    accent: {
      DEFAULT: "#C86B4A", // clay
      dark: "#9B4D35",
      muted: "#F4E7E0",
      foreground: "#FFFFFF",
    },

    state: {
      success: "#2F7458",
      successMuted: "#E2EFE9",
      info: "#2F6597",
      infoMuted: "#E2EAF3",
      warning: "#9A6517",
      warningMuted: "#F3ECDC",
      review: "#8B5140",
      reviewMuted: "#F1E6E0",
      destructive: "#B14444",
      destructiveMuted: "#F1DEDE",
      paused: "#5E6873",
      pausedMuted: "#E6E9EC",
    },
  },

  radius: {
    xs: "6px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    pill: "999px",
  },

  spacing: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    7: "32px",
    8: "40px",
    9: "48px",
    10: "64px",
    11: "80px",
    12: "96px",
  },

  font: {
    heading: "Manrope",
    body: "Source Sans 3",
  },

  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
  },

  shadow: {
    none: "none",
    1: "0 1px 2px rgba(36, 48, 46, 0.04), 0 1px 1px rgba(36, 48, 46, 0.03)",
    2: "0 8px 24px rgba(36, 48, 46, 0.08)",
    surface:
      "0 1px 2px rgba(36, 48, 46, 0.04), 0 1px 0 rgba(36, 48, 46, 0.02)",
    focus: "0 0 0 2px var(--color-primary)",
  },

  motion: {
    easeStandard: "cubic-bezier(0.2, 0, 0, 1)",
    durationFast: "150ms",
    durationBase: "200ms",
  },

  breakpoints: {
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px",
    "2xl": "1440px",
  },

  layout: {
    sidebarWidth: "240px",
    topBarHeight: "64px",
    contentMaxWidth: "1280px",
    contentPaddingX: "32px",
  },
} as const;

export type DesignTokens = typeof designTokens;
