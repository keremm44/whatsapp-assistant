import type { Config } from "tailwindcss";

/**
 * Tailwind theme is wired to the canonical design tokens
 * defined in src/config/design-tokens.ts and exposed as CSS variables
 * via src/app/globals.css. Do not introduce raw hex values here — extend
 * the design tokens instead.
 *
 * Color values are stored in `R G B` numeric form (without commas, in
 * the `--color-*-rgb` variables) so Tailwind can compose them with
 * the modern `<alpha-value>` placeholder, e.g.
 *
 *     color-mix(in srgb, rgb(var(--color-primary-rgb) / <alpha-value>) ...)
 *
 * This is what makes `border-primary/40` and `text-foreground/70`
 * actually produce a partially transparent result. The older direct
 * `var(--color-primary)` form does NOT support the alpha modifier in
 * Tailwind 3; utilities like `bg-primary/40` are silently dropped.
 *
 * The `globals.css` file is the single source of truth for the
 * canonical R G B triplets.
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1440px",
      },
    },
    extend: {
      colors: {
        background: "rgb(var(--color-background-rgb) / <alpha-value>)",
        /* Semantic material roles (Working Ledger). `canvas`,
         * `paper`, `recessed`, `floating` and `boundary` are the
         * canonical names; `background`, `surface`, `surface-2` and
         * `border` remain as aliases so non-pilot routes keep
         * working unchanged. */
        canvas: "rgb(var(--color-canvas-rgb) / <alpha-value>)",
        sunken: "rgb(var(--color-sunken-rgb) / <alpha-value>)",
        raised: "rgb(var(--color-raised-rgb) / <alpha-value>)",
        overlay: "rgb(var(--color-overlay-rgb) / <alpha-value>)",
        elevated: "rgb(var(--color-hover-rgb) / <alpha-value>)",
        paper: "rgb(var(--color-paper-rgb) / <alpha-value>)",
        recessed: "rgb(var(--color-recessed-rgb) / <alpha-value>)",
        floating: "rgb(var(--color-floating-rgb) / <alpha-value>)",
        boundary: "rgb(var(--color-boundary-rgb) / <alpha-value>)",
        chrome: {
          DEFAULT: "rgb(var(--color-chrome-rgb) / <alpha-value>)",
          hover: "rgb(var(--color-chrome-hover-rgb) / <alpha-value>)",
          foreground:
            "rgb(var(--color-chrome-foreground-rgb) / <alpha-value>)",
        },
        foreground: "rgb(var(--color-foreground-rgb) / <alpha-value>)",
        surface: "rgb(var(--color-surface-rgb) / <alpha-value>)",
        "surface-2": "rgb(var(--color-surface-2-rgb) / <alpha-value>)",
        selected: "rgb(var(--color-selected-rgb) / <alpha-value>)",
        control: "rgb(var(--color-control-rgb) / <alpha-value>)",
        border: "rgb(var(--color-border-rgb) / <alpha-value>)",
        divider: "rgb(var(--color-divider-rgb) / <alpha-value>)",
        muted: "rgb(var(--color-muted-rgb) / <alpha-value>)",
        "muted-foreground": "rgb(var(--color-muted-foreground-rgb) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--color-primary-rgb) / <alpha-value>)",
          hover: "rgb(var(--color-primary-hover-rgb) / <alpha-value>)",
          active: "rgb(var(--color-primary-active-rgb) / <alpha-value>)",
          muted: "rgb(var(--color-primary-muted-rgb) / <alpha-value>)",
          foreground: "rgb(var(--color-primary-foreground-rgb) / <alpha-value>)",
          /* Readable small-text expression of petrol on dark
           * seller surfaces (identical to base petrol on light). */
          text: "rgb(var(--color-primary-text-rgb) / <alpha-value>)",
          /* Filled primary control role (darker AA-passing petrol
           * step on dark seller surfaces; identical to base on
           * light). */
          button: {
            DEFAULT: "rgb(var(--color-primary-button-rgb) / <alpha-value>)",
            hover: "rgb(var(--color-primary-button-hover-rgb) / <alpha-value>)",
          },
        },
        accent: {
          DEFAULT: "rgb(var(--color-accent-rgb) / <alpha-value>)",
          dark: "rgb(var(--color-accent-dark-rgb) / <alpha-value>)",
          muted: "rgb(var(--color-accent-muted-rgb) / <alpha-value>)",
          foreground: "rgb(var(--color-accent-foreground-rgb) / <alpha-value>)",
          /* Readable small-text expression of the clay family on
           * dark clay surfaces (identical to accent-dark on light). */
          text: "rgb(var(--color-accent-text-rgb) / <alpha-value>)",
        },
        success: "rgb(var(--color-success-rgb) / <alpha-value>)",
        "success-muted": "rgb(var(--color-success-muted-rgb) / <alpha-value>)",
        info: "rgb(var(--color-info-rgb) / <alpha-value>)",
        "info-muted": "rgb(var(--color-info-muted-rgb) / <alpha-value>)",
        warning: "rgb(var(--color-warning-rgb) / <alpha-value>)",
        "warning-muted": "rgb(var(--color-warning-muted-rgb) / <alpha-value>)",
        review: "rgb(var(--color-review-rgb) / <alpha-value>)",
        "review-muted": "rgb(var(--color-review-muted-rgb) / <alpha-value>)",
        destructive: {
          DEFAULT: "rgb(var(--color-destructive-rgb) / <alpha-value>)",
          muted: "rgb(var(--color-destructive-muted-rgb) / <alpha-value>)",
          foreground: "rgb(var(--color-destructive-foreground-rgb) / <alpha-value>)",
        },
        /* Seller attention (oxide). Backend-supported review /
         * intervention only — never decoration. */
        attention: {
          DEFAULT: "rgb(var(--color-attention-rgb) / <alpha-value>)",
          soft: "rgb(var(--color-attention-soft-rgb) / <alpha-value>)",
        },
        /* Brand (iris). Product identity only — never a state,
         * interaction or content-type code. */
        brand: {
          DEFAULT: "rgb(var(--color-brand-rgb) / <alpha-value>)",
          soft: "rgb(var(--color-brand-soft-rgb) / <alpha-value>)",
          foreground: "rgb(var(--color-brand-foreground-rgb) / <alpha-value>)",
          text: "rgb(var(--color-brand-text-rgb) / <alpha-value>)",
        },
        paused: "rgb(var(--color-paused-rgb) / <alpha-value>)",
        "paused-muted": "rgb(var(--color-paused-muted-rgb) / <alpha-value>)",
      },
      borderRadius: {
        /* Geometry roles: control 4px, work sheet 6px, floating 10px. */
        control: "var(--radius-control)",
        sheet: "var(--radius-sheet)",
        floating: "var(--radius-floating)",
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
      fontFamily: {
        /* `title` is the serif role (page titles + record identity).
         * `heading` and `body` are the sans roles. See globals.css
         * for the font-loading decision. */
        /* One grotesque family, two roles. `title` is kept as an
         * alias of the display role so existing callers keep working
         * — it is no longer a serif. */
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        title: ["var(--font-display)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        numeric: ["var(--font-numeric)", "ui-monospace", "monospace"],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.4" }],
        sm: ["0.875rem", { lineHeight: "1.5" }],
        base: ["1rem", { lineHeight: "1.6" }],
        lg: ["1.125rem", { lineHeight: "1.55" }],
        xl: ["1.25rem", { lineHeight: "1.4" }],
        "2xl": ["1.5rem", { lineHeight: "1.3" }],
        "3xl": ["1.875rem", { lineHeight: "1.25" }],
        "4xl": ["2.25rem", { lineHeight: "1.2" }],
      },
      boxShadow: {
        none: "var(--shadow-none)",
        1: "var(--shadow-1)",
        2: "var(--shadow-2)",
        surface: "var(--shadow-surface)",
        inset: "var(--shadow-inset)",
        focus: "var(--shadow-focus)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-in-bottom": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in var(--dur-base) var(--ease-standard)",
        "slide-in-right": "slide-in-right var(--dur-base) var(--ease-standard)",
        "slide-in-left": "slide-in-left var(--dur-base) var(--ease-standard)",
        "slide-in-bottom": "slide-in-bottom var(--dur-base) var(--ease-standard)",
      },
    },
  },
  plugins: [],
};

export default config;
