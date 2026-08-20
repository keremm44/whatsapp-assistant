import { apiFetchWithAccessToken } from "@/lib/api/authenticated";

import {
  parseAdminApplicationsTotal,
  parseAdminLatestAnnouncement,
  parseAdminOverviewTotal,
  type AdminLatestAnnouncement,
} from "./overview-format";

export type AdminOverviewSource<T> =
  | { state: "ready"; data: T }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

export type AdminOverviewSnapshot = {
  pendingApplications: AdminOverviewSource<{ total: number }>;
  activationReviews: AdminOverviewSource<{ total: number }>;
  openFeedback: AdminOverviewSource<{ total: number }>;
  latestAnnouncement: AdminOverviewSource<AdminLatestAnnouncement>;
};

const classify = <T>(error: unknown): AdminOverviewSource<T> => {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 401
  ) {
    return { state: "auth_rejected" };
  }
  return { state: "unavailable" };
};

const resolve = async <T>(
  request: () => Promise<T>,
): Promise<AdminOverviewSource<T>> => {
  try {
    return { state: "ready", data: await request() };
  } catch (error) {
    return classify<T>(error);
  }
};

export const resolveAdminOverview = async (
  accessToken: string,
): Promise<AdminOverviewSnapshot> => {
  const [pendingApplications, activationReviews, openFeedback, latestAnnouncement] =
    await Promise.all([
      resolve(async () =>
        parseAdminApplicationsTotal(
          await apiFetchWithAccessToken<unknown>(
            "/admin/applications?status=pending&limit=5",
            accessToken,
            { cache: "no-store" },
          ),
        ),
      ),
      resolve(async () =>
        parseAdminOverviewTotal(
          await apiFetchWithAccessToken<unknown>(
            "/admin/sellers?system_status=admin_review_pending&limit=5&offset=0",
            accessToken,
            { cache: "no-store" },
          ),
          "sellers",
        ),
      ),
      resolve(async () =>
        parseAdminOverviewTotal(
          await apiFetchWithAccessToken<unknown>(
            "/admin/feedback?status=OPEN&limit=5&offset=0",
            accessToken,
            { cache: "no-store" },
          ),
          "feedback",
        ),
      ),
      resolve(async () =>
        parseAdminLatestAnnouncement(
          await apiFetchWithAccessToken<unknown>(
            "/admin/announcements?limit=1&offset=0",
            accessToken,
            { cache: "no-store" },
          ),
        ),
      ),
    ]);

  return {
    pendingApplications,
    activationReviews,
    openFeedback,
    latestAnnouncement,
  };
};
