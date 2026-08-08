/**
 * Supabase session-refresh helper for Next.js middleware.
 *
 * The middleware uses the @supabase/ssr "createServerClient" + "getAll/setAll"
 * pattern so that expired access tokens are transparently refreshed on each
 * request. This is the recommended pattern for App Router.
 *
 * No business authorization happens here. Route guards live in the
 * appropriate layouts (e.g. /seller/layout.tsx) once the auth foundation
 * is wired.
 */

import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import { env } from "@/config/env";

export const updateSupabaseSession = async (request: NextRequest) => {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.supabaseUrl,
    env.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options as never);
          }
        },
      },
    },
  );

  // Triggers the refresh flow. Do not remove — even when the result is
  // unused, the call refreshes cookies if needed.
  await supabase.auth.getUser();

  return response;
};
