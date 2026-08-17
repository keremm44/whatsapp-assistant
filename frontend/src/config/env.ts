/**
 * Centralized, typed access to NEXT_PUBLIC_* environment variables.
 *
 * Browser-safe values only. Never reference process.env directly elsewhere.
 * Missing required configuration throws a clear configuration error when
 * the value is read, not at module load, so that the Next.js build step
 * can complete in environments where the runtime env has not yet been
 * provisioned.
 *
 * The service role key, database URL, JWT secret, OpenAI key, and any
 * other backend secret must never appear in this package.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const required = (name: string, value: string | undefined): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(
      `[env] Missing required environment variable: ${name}. ` +
        "Copy frontend/.env.example to frontend/.env.local and fill it in.",
    );
  }
  return normalized;
};

const optional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized;
};

const trimTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;

const securePublicUrl = (name: string, value: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[env] ${name} must be a valid HTTP(S) URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`[env] ${name} must be a valid HTTP(S) URL.`);
  }

  if (parsed.username || parsed.password) {
    throw new Error(`[env] ${name} must not contain embedded credentials.`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol === "http:" && !LOOPBACK_HOSTS.has(hostname)) {
    throw new Error(
      `[env] ${name} must use HTTPS outside local development.`,
    );
  }

  return value;
};

/**
 * Read-once accessors. We deliberately do NOT call `required()` at module
 * top level: doing so would break `next build` in clean CI environments
 * where .env.local is not present. Errors are deferred to the first read
 * of the value at request time.
 */
export const env = {
  get apiBaseUrl(): string {
    return trimTrailingSlash(
      securePublicUrl(
        "NEXT_PUBLIC_API_BASE_URL",
        required(
          "NEXT_PUBLIC_API_BASE_URL",
          process.env.NEXT_PUBLIC_API_BASE_URL,
        ),
      ),
    );
  },

  get supabaseUrl(): string {
    return securePublicUrl(
      "NEXT_PUBLIC_SUPABASE_URL",
      required(
        "NEXT_PUBLIC_SUPABASE_URL",
        process.env.NEXT_PUBLIC_SUPABASE_URL,
      ),
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
   * Local development may omit it. Production deployments should set it
   * explicitly so metadata/canonical URLs never point at localhost.
   */
  get siteUrl(): string {
    const configured = optional(process.env.NEXT_PUBLIC_SITE_URL);
    if (!configured) {
      return "http://localhost:3000";
    }
    return securePublicUrl("NEXT_PUBLIC_SITE_URL", configured);
  },
} as const;

export type AppEnv = typeof env;
