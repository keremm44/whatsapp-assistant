/**
 * Design tokens — canonical source of truth.
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
 * Material hierarchy:
 *   background — page canvas; chrome — persistent shell; surface — work plane;
 *   surface-2 — neutral raised material; selected — active petrol plane;
 *   control — inset form-control material.
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
    surface2: color("#EEF2EF", "neutral raised surface"),
    selected: color("#E7F0EE", "petrol-selected surface"),
    control: color("#FFFFFF", "inset form-control surface"),
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

  /**
   * SELLER WORKSPACE — "Instrument" (dark).
   *
   * Applied by the `.seller-theme` override in src/app/globals.css.
   * Recorded here as the art-direction source of truth; components
   * consume these through Tailwind semantic classes (bg-canvas,
   * bg-raised, bg-sunken, text-attention, ...), never as raw hex.
   *
   * Carried over from the Working Ledger pilot: ledger row
   * discipline, reduced-card grammar, separated selection/attention
   * semantics, strong hierarchy. Dropped: light paper surfaces and
   * the serif-led editorial voice.
   */
  sellerInstrument: {
    /**
     * Measured material ladder. Every adjacent step is >= ~3.4 ΔE
     * apart so surfaces cannot collapse on a dim display, and the
     * whole ladder holds one blue-graphite hue (chroma 5-9) so it
     * reads as a designed material rather than neutral gray.
     */
    material: {
      chrome: color("#06090D", "navigation spine — deepest material"),
      sunken: color("#0D1117", "recessed wells, queue, inset regions"),
      canvas: color("#12171F", "the field the work sits on"),
      raised: color("#1C222C", "ordinary work sheet"),
      overlay: color("#242B37", "dialogs / sheets — real elevation"),
      hover: color("#2D3542", "interactive top step"),
    },
    ink: {
      // Each level is validated against the WORST material it can
      // legally land on (hover + selection fill), not just canvas.
      primary: color("#E8ECF2"),
      secondary: color("#A8B2C1"),
      tertiary: color("#939DAC", "tuned up from #7E8899 for AA"),
    },
    structure: {
      // On dark material a rule must be LIGHTER than its host.
      divider: color("#262D38", "ordinary record/section rule"),
      boundary: color("#38404D", "one strong structural edge"),
    },
    /** Cyan = selected / active / navigation / focus / primary action. */
    interaction: {
      DEFAULT: color("#4FB3C9"),
      hover: color("#6AC4D8"),
      soft: color("#173039", "selection fill"),
      foreground: color("#06222B", "dark ink on a bright fill"),
    },
    /** Coral = backend-supported seller attention only. 180° from cyan. */
    attention: {
      DEFAULT: color("#EA8266", "AA on every surface incl. hover"),
      soft: color("#331D17"),
    },
    state: {
      success: color("#5EC59A"),
      successSoft: color("#14332A"),
      warning: color("#E8A34D"),
      warningSoft: color("#33260F"),
      paused: color("#949DAC", "AA on every surface incl. hover"),
      pausedSoft: color("#1E242E"),
      destructive: color("#F2717A"),
      destructiveSoft: color("#3A1A1E"),
    },
  },

  radius: {
    /** Geometry roles: crisp controls, softly squared work sheets,
     *  and real radius only for genuinely floating objects. */
    control: "4px",
    sheet: "6px",
    floating: "10px",
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

  /**
   * Typography roles. ONE grotesque family carries every role;
   * hierarchy comes from size, weight, tracking and ink level rather
   * than from a second typeface. See the font-loading decision at the
   * top of src/app/globals.css — no real assets are vendored yet, so
   * the stacks fall back to system grotesques while the role
   * architecture and scale are already in force.
   */
  font: {
    display: "Inter",
    heading: "Inter",
    body: "Inter",
  },

  /** Macro type scale (px / line-height px). */
  typeScale: {
    pageTitleDesktop: { size: 40, leading: 46 },
    pageTitleMobile: { size: 34, leading: 40 },
    section: { size: 22, leading: 28 },
    recordIdentity: { size: 19, leading: 26 },
    body: { size: 15, leading: 22 },
    rowPrimary: { size: 14, leading: 20 },
    rowSecondary: { size: 13, leading: 19 },
    meta: { size: 12, leading: 17 },
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
