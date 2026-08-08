import type { Config } from "tailwindcss";

/**
 * Tailwind theme is wired to the canonical Sakin Ustalık design tokens
 * defined in src/config/design-tokens.ts and exposed as CSS variables
 * via src/app/globals.css. Do not introduce raw hex values here — extend
 * the design tokens instead.
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
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        surface: "var(--color-surface)",
        "surface-2": "var(--color-surface-2)",
        border: "var(--color-border)",
        divider: "var(--color-divider)",
        muted: "var(--color-muted)",
        "muted-foreground": "var(--color-muted-foreground)",
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          active: "var(--color-primary-active)",
          muted: "var(--color-primary-muted)",
          foreground: "var(--color-primary-foreground)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          dark: "var(--color-accent-dark)",
          muted: "var(--color-accent-muted)",
          foreground: "var(--color-accent-foreground)",
        },
        success: "var(--color-success)",
        "success-muted": "var(--color-success-muted)",
        info: "var(--color-info)",
        "info-muted": "var(--color-info-muted)",
        warning: "var(--color-warning)",
        "warning-muted": "var(--color-warning-muted)",
        review: "var(--color-review)",
        "review-muted": "var(--color-review-muted)",
        destructive: {
          DEFAULT: "var(--color-destructive)",
          muted: "var(--color-destructive-muted)",
          foreground: "var(--color-destructive-foreground)",
        },
        paused: "var(--color-paused)",
        "paused-muted": "var(--color-paused-muted)",
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
      fontFamily: {
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
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
      },
      animation: {
        "fade-in": "fade-in var(--dur-base) var(--ease-standard)",
        "slide-in-right": "slide-in-right var(--dur-base) var(--ease-standard)",
      },
    },
  },
  plugins: [],
};

export default config;
