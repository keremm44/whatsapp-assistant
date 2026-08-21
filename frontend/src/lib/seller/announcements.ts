/** Seller announcements — strict frontend contract for the backend API. */

export type SellerAnnouncementAudience = "ALL_SELLERS" | "SELECTED_SELLERS";
export type SellerAnnouncementImportance = "NORMAL" | "IMPORTANT";

export type SellerAnnouncement = {
  id: number;
  title: string;
  message: string;
  audienceType: SellerAnnouncementAudience;
  importance: SellerAnnouncementImportance;
  imageUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  publishedAt: string;
  createdAt: string;
};

export type SellerAnnouncementListPage = {
  total: number;
  limit: number;
  offset: number;
  unreadCount: number;
  announcements: SellerAnnouncement[];
};

export type SellerAnnouncementReadResult = {
  announcementId: number;
  isRead: true;
  readAt: string;
  changed: boolean;
  unreadCount: number;
};

const CONTRACT_PREFIX = "announcements_invalid_";
const contractError = (tag: string): Error => new Error(`${CONTRACT_PREFIX}${tag}`);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const read = (obj: Record<string, unknown>, key: string): unknown => {
  if (!(key in obj)) throw contractError(`${key}_missing`);
  return obj[key];
};

const readPositiveInt = (obj: Record<string, unknown>, key: string): number => {
  const value = read(obj, key);
  if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value) || value < 1) {
    throw contractError(`${key}_shape`);
  }
  return value;
};

const readNonNegativeInt = (obj: Record<string, unknown>, key: string): number => {
  const value = read(obj, key);
  if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value) || value < 0) {
    throw contractError(`${key}_shape`);
  }
  return value;
};

const readNonEmptyString = (obj: Record<string, unknown>, key: string): string => {
  const value = read(obj, key);
  if (typeof value !== "string" || value.length === 0) throw contractError(`${key}_shape`);
  return value;
};

const readNullableString = (obj: Record<string, unknown>, key: string): string | null => {
  const value = read(obj, key);
  if (value === null) return null;
  if (typeof value !== "string" || value.length === 0) throw contractError(`${key}_shape`);
  return value;
};

const readBoolean = (obj: Record<string, unknown>, key: string): boolean => {
  const value = read(obj, key);
  if (typeof value !== "boolean") throw contractError(`${key}_shape`);
  return value;
};

const parseAudience = (value: unknown): SellerAnnouncementAudience => {
  if (value !== "ALL_SELLERS" && value !== "SELECTED_SELLERS") throw contractError("audience_type");
  return value;
};

const parseImportance = (value: unknown): SellerAnnouncementImportance => {
  if (value !== "NORMAL" && value !== "IMPORTANT") throw contractError("importance");
  return value;
};

const parseImageUrl = (value: unknown): string | null => {
  if (value === null) return null;
  if (typeof value !== "string" || !value.startsWith("https://")) throw contractError("image_url");
  return value;
};

export const parseSellerAnnouncement = (raw: unknown): SellerAnnouncement => {
  if (!isObject(raw)) throw contractError("announcement");
  const isRead = readBoolean(raw, "is_read");
  const readAt = readNullableString(raw, "read_at");
  if (isRead !== (readAt !== null)) throw contractError("read_state_mismatch");
  return {
    id: readPositiveInt(raw, "id"),
    title: readNonEmptyString(raw, "title"),
    message: readNonEmptyString(raw, "message"),
    audienceType: parseAudience(read(raw, "audience_type")),
    importance: parseImportance(read(raw, "importance")),
    imageUrl: parseImageUrl(read(raw, "image_url")),
    isRead,
    readAt,
    publishedAt: readNonEmptyString(raw, "published_at"),
    createdAt: readNonEmptyString(raw, "created_at"),
  };
};

export const parseSellerAnnouncementListResponse = (raw: unknown): SellerAnnouncementListPage => {
  if (!isObject(raw)) throw contractError("list");
  const total = readNonNegativeInt(raw, "total");
  const limit = readPositiveInt(raw, "limit");
  const offset = readNonNegativeInt(raw, "offset");
  if (limit > 100) throw contractError("limit_range");
  const items = read(raw, "announcements");
  if (!Array.isArray(items)) throw contractError("announcements_shape");
  if (items.length > limit) throw contractError("announcements_limit");
  return {
    total,
    limit,
    offset,
    unreadCount: readNonNegativeInt(raw, "unread_count"),
    announcements: items.map(parseSellerAnnouncement),
  };
};

export const parseSellerAnnouncementUnreadCount = (raw: unknown): number => {
  if (!isObject(raw)) throw contractError("unread_count");
  return readNonNegativeInt(raw, "unread_count");
};

export const parseSellerAnnouncementReadResponse = (raw: unknown): SellerAnnouncementReadResult => {
  if (!isObject(raw)) throw contractError("read_response");
  if (!readBoolean(raw, "is_read")) throw contractError("read_response_state");
  return {
    announcementId: readPositiveInt(raw, "announcement_id"),
    isRead: true,
    readAt: readNonEmptyString(raw, "read_at"),
    changed: readBoolean(raw, "changed"),
    unreadCount: readNonNegativeInt(raw, "unread_count"),
  };
};

export const formatAnnouncementDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(date);
};
