/**
 * Centralized, typed access to NEXT_PUBLIC_* environment variables.
 *
 * Browser-safe values only. Never reference process.env directly elsewhere.
 * Missing required configuration throws a clear development error when
 * the value is read, not at module load, so that the Next.js build step
 * can complete in environments where the runtime env has not yet been
 * provisioned.
 *
 * The service role key, database URL, JWT secret, OpenAI key, and any
 * other backend secret must never appear in this package.
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

/**
 * Read-once accessors. We deliberately do NOT call `required()` at module
 * top level: doing so would break `next build` in clean CI environments
 * where .env.local is not present. Errors are deferred to the first read
 * of the value at request time.
 */
export const env = {
  get apiBaseUrl(): string {
    return trimTrailingSlash(
      required(
        "NEXT_PUBLIC_API_BASE_URL",
        process.env.NEXT_PUBLIC_API_BASE_URL,
      ),
    );
  },

  get supabaseUrl(): string {
    return required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },

  get supabaseAnonKey(): string {
    return required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },

  get appEnv(): string {
    return optional(process.env.NEXT_PUBLIC_APP_ENV) ?? "development";
  },

  /**
   * Public site URL. Browser-visible; only the public origin lives here.
   * Falls back to the local development origin so foundation pages render
   * without explicit configuration.
   */
  get siteUrl(): string {
    return optional(process.env.NEXT_PUBLIC_SITE_URL) ?? "http://localhost:3000";
  },
} as const;

export type AppEnv = typeof env;
