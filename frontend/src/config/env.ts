/**
 * Centralized, typed access to NEXT_PUBLIC_* environment variables.
 *
 * Browser-safe values only. Never reference process.env directly elsewhere.
 * Missing required configuration throws a clear development error so the
 * developer notices immediately instead of seeing silent 4xx responses.
 */

const required = (name: string, value: string | undefined): string => {
  if (value === undefined || value === "") {
    throw new Error(
      `[env] Missing required environment variable: ${name}. ` +
        "Copy frontend/.env.example to frontend/.env.local and fill it in.",
    );
  }
  return value;
};

const optional = (value: string | undefined): string | undefined => {
  if (value === undefined || value === "") {
    return undefined;
  }
  return value;
};

const trimTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;

export const env = {
  /**
   * Backend FastAPI base URL, e.g. "http://127.0.0.1:8000".
   * The frontend never talks to Supabase tables or storage directly except
   * for managing the user session.
   */
  apiBaseUrl: trimTrailingSlash(
    required(
      "NEXT_PUBLIC_API_BASE_URL",
      process.env.NEXT_PUBLIC_API_BASE_URL,
    ),
  ),

  /** Supabase project URL (browser-visible). */
  supabaseUrl: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),

  /** Supabase anonymous key (browser-visible). Never use service role here. */
  supabaseAnonKey: required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),

  /** Convenience flag for non-essential environment. */
  appEnv: optional(process.env.NEXT_PUBLIC_APP_ENV) ?? "development",
} as const;

export type AppEnv = typeof env;
