/**
 * Browser-side Supabase client.
 *
 * Uses the @supabase/ssr browser client which is the supported pattern for
 * Next.js App Router. The anon key is the only public credential here; the
 * service role key must never appear in this package.
 */

import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/config/env";

export const createSupabaseBrowserClient = () => {
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
};
