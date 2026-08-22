/** Seller announcements — authenticated fetchers for the backend API. */

import { apiFetchWithAccessToken } from "@/lib/api/authenticated";
import {
  parseSellerAnnouncementListResponse,
  parseSellerAnnouncementReadResponse,
  parseSellerAnnouncementUnreadCount,
  type SellerAnnouncementListPage,
  type SellerAnnouncementReadResult,
} from "./announcements";

export type FetchSellerAnnouncementsOptions = {
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
};

export const fetchSellerAnnouncementList = async (
  accessToken: string,
  options: FetchSellerAnnouncementsOptions = {},
): Promise<SellerAnnouncementListPage> => {
  const query = new URLSearchParams();
  query.set("limit", String(options.limit ?? 20));
  query.set("offset", String(options.offset ?? 0));
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/announcements?${query.toString()}`,
    accessToken,
    { signal: options.signal, cache: "no-store" },
  );
  return parseSellerAnnouncementListResponse(raw);
};

export const fetchSellerAnnouncementUnreadCount = async (
  accessToken: string,
  options: { signal?: AbortSignal } = {},
): Promise<number> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    "/seller/announcements/unread-count",
    accessToken,
    { signal: options.signal, cache: "no-store" },
  );
  return parseSellerAnnouncementUnreadCount(raw);
};

export const markSellerAnnouncementRead = async (
  accessToken: string,
  announcementId: number,
  options: { signal?: AbortSignal } = {},
): Promise<SellerAnnouncementReadResult> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/announcements/${announcementId}/read`,
    accessToken,
    { method: "POST", signal: options.signal, cache: "no-store" },
  );
  const parsed = parseSellerAnnouncementReadResponse(raw);
  if (parsed.announcementId !== announcementId) {
    throw new Error("announcements_invalid_read_response_id_mismatch");
  }
  return parsed;
};
