/**
 * Browser-side Supabase client.
 *
 * Uses the @supabase/ssr browser client which is the supported pattern for
 * Next.js App Router. The anon key is the only public credential here; the
 * service role key must never appear in this package.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { env } from "@/config/env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;
let messagesInsertChannel: RealtimeChannel | null = null;
const messageInsertListeners = new Set<() => void>();

export const createSupabaseBrowserClient = () => {
  if (browserClient === null) {
    browserClient = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return browserClient;
};

/**
 * Subscribe to INSERT events on the canonical `messages` table.
 *
 * All seller conversation surfaces share one browser client + one Realtime
 * channel. Components register lightweight listeners and release them on
 * unmount; the underlying channel is removed when the last listener leaves.
 */
export const subscribeToMessageInserts = (listener: () => void): (() => void) => {
  messageInsertListeners.add(listener);

  if (messagesInsertChannel === null) {
    const supabase = createSupabaseBrowserClient();
    messagesInsertChannel = supabase
      .channel("seller-conversations-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        () => {
          for (const currentListener of messageInsertListeners) {
            currentListener();
          }
        },
      )
      .subscribe();
  }

  return () => {
    messageInsertListeners.delete(listener);
    if (messageInsertListeners.size > 0 || messagesInsertChannel === null) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const channel = messagesInsertChannel;
    messagesInsertChannel = null;
    void supabase.removeChannel(channel);
  };
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
