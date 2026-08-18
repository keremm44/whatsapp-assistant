import { apiFetchWithAccessToken } from "@/lib/api/authenticated";
import {
  parseSellerFeedbackCreateResponse,
  parseSellerFeedbackListResponse,
  type SellerFeedback,
  type SellerFeedbackCategory,
  type SellerFeedbackListPage,
} from "./feedback";

export type SellerFeedbackCreatePayload = {
  category: SellerFeedbackCategory;
  subject: string;
  message: string;
};

export const createSellerFeedback = async (
  accessToken: string,
  payload: SellerFeedbackCreatePayload,
  options: { signal?: AbortSignal } = {},
): Promise<SellerFeedback> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    "/seller/feedback",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(payload),
      signal: options.signal,
      cache: "no-store",
    },
  );
  return parseSellerFeedbackCreateResponse(raw);
};

export const fetchSellerFeedbackList = async (
  accessToken: string,
  options: { limit?: number; offset?: number; signal?: AbortSignal } = {},
): Promise<SellerFeedbackListPage> => {
  const query = new URLSearchParams();
  query.set("limit", String(options.limit ?? 10));
  query.set("offset", String(options.offset ?? 0));

  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/feedback?${query.toString()}`,
    accessToken,
    {
      signal: options.signal,
      cache: "no-store",
    },
  );
  return parseSellerFeedbackListResponse(raw);
};
