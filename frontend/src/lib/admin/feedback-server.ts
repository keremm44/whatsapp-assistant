import "server-only";
import { resolveSession } from "@/lib/supabase/session";
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

const httpStatus = (e: unknown): number => {
  if (e && typeof e === "object" && "status" in e) {
    return (e as { status?: number }).status ?? 0;
  }
  return 0;
};

export const resolveAdminFeedbackList = async (input: {
  status?: AdminFeedbackStatus;
  category?: AdminFeedbackCategory;
}): Promise<AdminFeedbackListBootstrap> => {
  const session = await resolveSession();
  if (!session) return { state: "unavailable" };
  try {
    return {
      state: "ready",
      page: await fetchAdminFeedback(session.accessToken, {
        ...input,
        limit: 30,
        offset: 0,
      }),
    };
  } catch {
    return { state: "unavailable" };
  }
};

export const resolveAdminFeedbackDetail = async (
  id: number,
): Promise<AdminFeedbackDetailBootstrap> => {
  const session = await resolveSession();
  if (!session) return { state: "unavailable" };
  try {
    return {
      state: "ready",
      feedback: await fetchAdminFeedbackDetail(session.accessToken, id),
    };
  } catch (e) {
    return httpStatus(e) === 404
      ? { state: "not_found" }
      : { state: "unavailable" };
  }
};
