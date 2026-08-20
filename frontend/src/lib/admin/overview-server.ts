import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  resolveAdminOverview,
  type AdminOverviewSnapshot,
} from "./overview";

const unavailable = (): AdminOverviewSnapshot => ({
  pendingApplications: { state: "unavailable" },
  activationReviews: { state: "unavailable" },
  openFeedback: { state: "unavailable" },
  latestAnnouncement: { state: "unavailable" },
});

/** Server-side admin overview bootstrap, gated by the same session the admin
 * layout just verified. Backend endpoints remain the source of every count. */
export const resolveAdminOverviewFromSession = async (): Promise<AdminOverviewSnapshot> => {
  const supabase = await createSupabaseServerClient();
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) return unavailable();
    return resolveAdminOverview(data.session.access_token);
  } catch {
    return unavailable();
  }
};
