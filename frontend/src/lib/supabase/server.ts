/**
 * Server-side Supabase client (RSC, Route Handlers, Server Actions).
 *
 * Uses the @supabase/ssr server client which reads and refreshes the session
 * cookies automatically. Keep this server-side only — never import it from
 * a "use client" file.
 */

import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";

import { env } from "@/config/env";

export const createSupabaseServerClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options as never);
          }
        } catch {
          // Called from a Server Component — silently ignore. The middleware
          // refreshes cookies on the way through, so session state is still
          // propagated via the response.
        }
      },
    },
  });
};
