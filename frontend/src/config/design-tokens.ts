/**
 * Sakin Ustalık design tokens — canonical source of truth.
 *
 * These constants are referenced from tailwind.config.ts (via CSS
 * variables declared in src/app/globals.css). Do not duplicate hex
 * values in components: use Tailwind classes mapped to these tokens
 * instead.
 *
 * Each color is exposed in two forms:
 *   - the canonical hex string (for direct CSS use, e.g. shadows)
 *   - the same value split into three numeric channels (`rgb: [r, g, b]`)
 *
 * The Tailwind config consumes the `rgb` form so that modern
 * `rgb(... / <alpha-value>)` syntax enables utilities like
 * `border-primary/40` and `text-foreground/70`. Without the
 * `rgb` form those alpha modifiers are silently dropped in
 * Tailwind 3, which would erase the design's hierarchy.
 *
 * Surface hierarchy (four visible levels, top to bottom):
 *   1. background       — main warm cream canvas
 *   2. chrome           — persistent shell surfaces (sidebar, topbar, mobile nav)
 *   3. surface          — primary working surface (content, lists, cards)
 *   4. surface-2        — secondary low-emphasis surface
 */

const split = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const n = h.length === 3
    ? h.split("").map((c) => parseInt(c + c, 16))
    : [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16));
  return [n[0]!, n[1]!, n[2]!] as [number, number, number];
};

const color = (hex: string, comment?: string) => ({
  hex,
  rgb: split(hex),
  ...(comment ? { comment } : {}),
}) as const;

export const designTokens = {
  color: {
    background: color("#F6F4EF", "linen"),
    chrome: color("#FAF8F3", "warm broken-white for persistent app chrome"),
    surface: color("#FFFFFF", "pure white working surface"),
    surface2: color("#EEF2EF", "petrol-tinted secondary surface"),
    border: color("#D9E0DC", "cool low-contrast hairline"),
    divider: color("#E4EAE6", "quiet hairline, slightly cooler than border"),

    text: {
      primary: color("#24302E"),
      secondary: color("#5C6966"),
      muted: color("#626D6A"),
      inverse: color("#FFFFFF"),
    },

    primary: {
      DEFAULT: color("#245B57", "petrol"),
      hover: color("#1C4845"),
      active: color("#153634"),
      muted: color("#E7F0EE", "petrol soft"),
      foreground: color("#FFFFFF"),
      // Role split (light values shown here; the dark seller theme
      // overrides both in globals.css): `text` is the readable
      // small-copy expression of petrol, `button` is the filled
      // primary control step meeting AA with primary-foreground.
      text: color("#245B57", "petrol as small text (light = base)"),
      button: color("#245B57", "filled primary control (light = base)"),
      buttonHover: color("#1C4845", "filled primary control hover"),
    },

    accent: {
      // Terracotta — the warm secondary brand family. Used as
      // the second visible brand color alongside petrol. The
      // DEFAULT value is the dark terracotta itself (not a
      // pale tint) so it can read as a real character color
      // when used at full opacity (e.g. task type rails, brand
      // micro-details, sidebar account surface). The muted
      // tone is a desaturated tint for soft backgrounds.
      DEFAULT: color("#9A4F3A", "terracotta"),
      dark: color("#7E3F2F", "terracotta dark"),
      muted: color("#EED8CF", "terracotta soft"),
      foreground: color("#FFFFFF"),
      // Readable small-copy expression of the clay family;
      // the dark seller theme overrides it with a brighter step.
      text: color("#7E3F2F", "clay as small text (light = accent dark)"),
    },

    state: {
      success: color("#2F7458"),
      successMuted: color("#E2EFE9"),
      info: color("#2F6597"),
      infoMuted: color("#E2EAF3"),
      warning: color("#9A6517"),
      warningMuted: color("#F3ECDC"),
      // The `review` state stays distinct from the terracotta
      // brand family: it is the semantic warning hue used for
      // return-issue item state and is not a brand color. The
      // return task type's TYPE rail in the dashboard reads as
      // a brand character color and is driven by the
      // `accent` family above, not by this `review` state.
      review: color("#8B5140"),
      reviewMuted: color("#F1E6E0"),
      destructive: color("#B14444"),
      destructiveMuted: color("#F1DEDE"),
      paused: color("#5E6873"),
      pausedMuted: color("#E6E9EC"),
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
