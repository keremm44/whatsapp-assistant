import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAdminAnnouncementDetail,
  fetchAdminAnnouncements,
  type AdminAnnouncement,
  type AdminAnnouncementPage,
} from "./announcements-api";

export type AdminAnnouncementListBootstrap =
  | { state: "ready"; page: AdminAnnouncementPage }
  | { state: "unavailable" };

export type AdminAnnouncementDetailBootstrap =
  | { state: "ready"; announcement: AdminAnnouncement }
  | { state: "not_found" }
  | { state: "unavailable" };

async function accessToken() {
  try {
    const supabase = await createSupabaseServerClient();
    const session = await supabase.auth.getSession();
    return session.error ? null : session.data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

const statusCode = (error: unknown) =>
  error && typeof error === "object" && "status" in error
    ? (error as { status?: unknown }).status
    : 0;

export async function resolveAdminAnnouncements(input: {
  limit?: number;
  offset?: number;
} = {}): Promise<AdminAnnouncementListBootstrap> {
  const token = await accessToken();
  if (!token) return { state: "unavailable" };
  try {
    return {
      state: "ready",
      page: await fetchAdminAnnouncements(token, {
        limit: input.limit ?? 30,
        offset: input.offset ?? 0,
      }),
    };
  } catch {
    return { state: "unavailable" };
  }
}

export async function resolveAdminAnnouncementDetail(
  id: number,
): Promise<AdminAnnouncementDetailBootstrap> {
  const token = await accessToken();
  if (!token) return { state: "unavailable" };
  try {
    return {
      state: "ready",
      announcement: await fetchAdminAnnouncementDetail(token, id),
    };
  } catch (error) {
    return statusCode(error) === 404
      ? { state: "not_found" }
      : { state: "unavailable" };
  }
}
