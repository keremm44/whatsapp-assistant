import assert from "node:assert/strict";
import test from "node:test";

import { env } from "./env.ts";

type EnvName =
  | "NEXT_PUBLIC_API_BASE_URL"
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "NEXT_PUBLIC_SITE_URL";

const withEnv = <T>(
  name: EnvName,
  value: string | undefined,
  run: () => T,
): T => {
  const previous = process.env[name];

  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }

  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
};

test("apiBaseUrl allows loopback HTTP and trims the trailing slash", () => {
  withEnv("NEXT_PUBLIC_API_BASE_URL", "http://127.0.0.1:8000/", () => {
    assert.equal(env.apiBaseUrl, "http://127.0.0.1:8000");
  });
});

test("apiBaseUrl rejects plaintext HTTP for non-loopback hosts", () => {
  withEnv("NEXT_PUBLIC_API_BASE_URL", "http://api.example.com", () => {
    assert.throws(
      () => env.apiBaseUrl,
      /must use HTTPS outside local development/,
    );
  });
});

test("apiBaseUrl rejects non-HTTP schemes and embedded credentials", () => {
  withEnv("NEXT_PUBLIC_API_BASE_URL", "ftp://api.example.com", () => {
    assert.throws(() => env.apiBaseUrl, /valid HTTP\(S\) URL/);
  });

  withEnv(
    "NEXT_PUBLIC_API_BASE_URL",
    "https://user:password@api.example.com",
    () => {
      assert.throws(() => env.apiBaseUrl, /embedded credentials/);
    },
  );
});

test("supabaseUrl requires HTTPS outside loopback development", () => {
  withEnv("NEXT_PUBLIC_SUPABASE_URL", "http://project.supabase.co", () => {
    assert.throws(
      () => env.supabaseUrl,
      /must use HTTPS outside local development/,
    );
  });

  withEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co", () => {
    assert.equal(env.supabaseUrl, "https://project.supabase.co");
  });
});

test("supabaseUrl allows IPv6 loopback HTTP for local development", () => {
  withEnv("NEXT_PUBLIC_SUPABASE_URL", "http://[::1]:54321", () => {
    assert.equal(env.supabaseUrl, "http://[::1]:54321");
  });
});

test("supabaseAnonKey rejects missing and whitespace-only values", () => {
  withEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined, () => {
    assert.throws(() => env.supabaseAnonKey, /Missing required environment variable/);
  });

  withEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "   ", () => {
    assert.throws(() => env.supabaseAnonKey, /Missing required environment variable/);
  });
});

test("siteUrl keeps the local fallback but validates configured public URLs", () => {
  withEnv("NEXT_PUBLIC_SITE_URL", undefined, () => {
    assert.equal(env.siteUrl, "http://localhost:3000");
  });

  withEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com", () => {
    assert.equal(env.siteUrl, "https://app.example.com");
  });

  withEnv("NEXT_PUBLIC_SITE_URL", "http://app.example.com", () => {
    assert.throws(
      () => env.siteUrl,
      /must use HTTPS outside local development/,
    );
  });
});
