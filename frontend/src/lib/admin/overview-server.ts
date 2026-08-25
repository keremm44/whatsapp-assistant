import "server-only";

import { resolveSession } from "@/lib/supabase/session";

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
  try {
    const session = await resolveSession();
    if (!session) return unavailable();
    return resolveAdminOverview(session.accessToken);
  } catch {
    return unavailable();
  }
};
