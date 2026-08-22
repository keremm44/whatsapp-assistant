import { apiFetchWithAccessToken } from "@/lib/api/authenticated";

export type AdminAnnouncementImportance = "NORMAL" | "IMPORTANT";
export type AdminAnnouncement = {
  id: number;
  title: string;
  message: string;
  audienceType: "ALL_SELLERS" | "SELECTED_SELLERS";
  importance: AdminAnnouncementImportance;
  imageUrl: string | null;
  targetCount: number;
  readCount: number;
  publishedAt: string;
};

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("admin_announcements_invalid");
  return value as Record<string, unknown>;
};
const string = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  if (typeof value !== "string" || !value) throw new Error(`admin_announcements_invalid_${key}`);
  return value;
};
const count = (record: Record<string, unknown>, key: string): number => {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`admin_announcements_invalid_${key}`);
  return value;
};
const row = (value: unknown): AdminAnnouncement => {
  const record = object(value);
  const audienceType = string(record, "audience_type");
  const importance = string(record, "importance");
  const imageUrl = record.image_url;
  if (audienceType !== "ALL_SELLERS" && audienceType !== "SELECTED_SELLERS") throw new Error("admin_announcements_invalid_audience");
  if (importance !== "NORMAL" && importance !== "IMPORTANT") throw new Error("admin_announcements_invalid_importance");
  if (imageUrl !== null && (typeof imageUrl !== "string" || !imageUrl.startsWith("https://"))) throw new Error("admin_announcements_invalid_image_url");
  return { id: count(record, "id"), title: string(record, "title"), message: string(record, "message"), audienceType, importance, imageUrl, targetCount: count(record, "target_count"), readCount: count(record, "read_count"), publishedAt: string(record, "published_at") };
};

export const fetchAdminAnnouncements = async (token: string): Promise<AdminAnnouncement[]> => {
  const response = object(await apiFetchWithAccessToken<unknown>("/admin/announcements?limit=30&offset=0", token, { cache: "no-store" }));
  if (!Array.isArray(response.announcements)) throw new Error("admin_announcements_invalid_list");
  return response.announcements.map(row);
};

export const createAdminAnnouncement = async (
  token: string,
  title: string,
  message: string,
  options: { importance?: AdminAnnouncementImportance; imageUrl?: string; sellerIds?: number[] } = {},
): Promise<AdminAnnouncement> => {
  const audience = options.sellerIds?.length ? { type: "SELECTED_SELLERS", seller_ids: options.sellerIds } : { type: "ALL_SELLERS" };
  const response = object(await apiFetchWithAccessToken<unknown>("/admin/announcements", token, { method: "POST", body: JSON.stringify({ title, message, importance: options.importance ?? "NORMAL", image_url: options.imageUrl || null, audience }) }));
  return row(response.announcement);
};
