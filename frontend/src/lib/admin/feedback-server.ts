import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAdminFeedback,
  fetchAdminFeedbackDetail,
  type AdminFeedback,
  type AdminFeedbackPage,
} from "./feedback-api";
import type {
  AdminFeedbackCategory,
  AdminFeedbackStatus,
} from "./feedback-format";

export type AdminFeedbackListBootstrap =
  | { state: "ready"; page: AdminFeedbackPage }
  | { state: "unavailable" };
export type AdminFeedbackDetailBootstrap =
  | { state: "ready"; feedback: AdminFeedback }
  | { state: "not_found" }
  | { state: "unavailable" };

const access = async () => {
  try {
    const supabase = await createSupabaseServerClient();
    const session = await supabase.auth.getSession();
    return session.error ? null : session.data.session?.access_token ?? null;
  } catch {
    return null;
  }
};

const statusCode = (error: unknown) =>
  error && typeof error === "object" && "status" in error
    ? (error as { status?: unknown }).status
    : 0;

export async function resolveAdminFeedbackList(input: {
  status?: AdminFeedbackStatus;
  category?: AdminFeedbackCategory;
  sellerId?: number;
  limit?: number;
  offset?: number;
}): Promise<AdminFeedbackListBootstrap> {
  const token = await access();
  if (!token) return { state: "unavailable" };
  try {
    return {
      state: "ready",
      page: await fetchAdminFeedback(token, {
        ...input,
        limit: input.limit ?? 30,
        offset: input.offset ?? 0,
      }),
    };
  } catch {
    return { state: "unavailable" };
  }
}

export async function resolveAdminFeedbackDetail(
  id: number,
): Promise<AdminFeedbackDetailBootstrap> {
  const token = await access();
  if (!token) return { state: "unavailable" };
  try {
    return { state: "ready", feedback: await fetchAdminFeedbackDetail(token, id) };
  } catch (error) {
    return statusCode(error) === 404
      ? { state: "not_found" }
      : { state: "unavailable" };
  }
}
