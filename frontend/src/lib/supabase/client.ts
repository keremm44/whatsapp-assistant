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

/**
 * Read the current browser session's access token for authenticated
 * backend calls from Client Components (e.g. the conversations
 * workbench's incremental fetches and control mutations).
 *
 * This is the browser-side mirror of the server resolver pattern: the
 * token comes from the @supabase/ssr browser client, which owns the
 * auth cookies. We never touch cookies, localStorage, or a second
 * auth system by hand.
 *
 * The helper never throws and never signs the user out. A `null`
 * return means the session lookup itself failed transiently (network,
 * SDK error) or there is no current session; the caller renders a
 * calm retryable state instead of assuming the session died.
 */
export const getBrowserAccessToken = async (): Promise<string | null> => {
  try {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return null;
    }
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
};
