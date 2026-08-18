/** Seller Feedback — authenticated fetchers for the existing backend API. */

import { apiFetchWithAccessToken } from "@/lib/api/authenticated";
import {
  normalizeSellerFeedbackCreatePayload,
  parseSellerFeedbackItemResponse,
  parseSellerFeedbackListResponse,
  type SellerFeedback,
  type SellerFeedbackCreatePayload,
  type SellerFeedbackListPage,
} from "./feedback";

export type FetchSellerFeedbackOptions = {
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
};

export const fetchSellerFeedbackList = async (
  accessToken: string,
  options: FetchSellerFeedbackOptions = {},
): Promise<SellerFeedbackListPage> => {
  const query = new URLSearchParams();
  query.set("limit", String(options.limit ?? 10));
  query.set("offset", String(options.offset ?? 0));

  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/feedback?${query.toString()}`,
    accessToken,
    {
      cache: "no-store",
      signal: options.signal,
    },
  );

  return parseSellerFeedbackListResponse(raw);
};

export const fetchSellerFeedbackDetail = async (
  accessToken: string,
  feedbackId: number,
  options: { signal?: AbortSignal } = {},
): Promise<SellerFeedback> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/feedback/${feedbackId}`,
    accessToken,
    {
      cache: "no-store",
      signal: options.signal,
    },
  );

  const parsed = parseSellerFeedbackItemResponse(raw);
  if (parsed.id !== feedbackId) {
    throw new Error("feedback_invalid_detail_response_id_mismatch");
  }
  return parsed;
};

export const createSellerFeedback = async (
  accessToken: string,
  payload: SellerFeedbackCreatePayload,
  options: { signal?: AbortSignal } = {},
): Promise<SellerFeedback> => {
  const normalized = normalizeSellerFeedbackCreatePayload(payload);
  const raw = await apiFetchWithAccessToken<unknown>(
    "/seller/feedback",
    accessToken,
    {
      method: "POST",
      cache: "no-store",
      signal: options.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized),
    },
  );

  return parseSellerFeedbackItemResponse(raw);
};
