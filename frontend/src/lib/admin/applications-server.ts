import "server-only";
import { resolveSession } from "@/lib/supabase/session";
import { fetchAdminApplications, type AdminApplication } from "./applications-api";

export const resolveAdminApplications = async (
  status?: AdminApplication["status"],
) => {
  try {
    const session = await resolveSession();
    if (!session) return { state: "unavailable" as const };
    return {
      state: "ready" as const,
      data: await fetchAdminApplications(session.accessToken, status),
    };
  } catch {
    return { state: "unavailable" as const };
  }
};
