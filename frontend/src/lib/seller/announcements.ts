/**
 * Seller Announcements — strict frontend contract for the existing backend API.
 *
 * The backend is authoritative for audience targeting and read state. The
 * frontend never infers access, importance, dismissal, or unread totals.
 */

export type SellerAnnouncementAudience = "ALL_SELLERS" | "SELECTED_SELLERS";

export type SellerAnnouncement = {
  id: number;
  title: string;
  message: string;
  audienceType: SellerAnnouncementAudience;
  isRead: boolean;
  readAt: string | null;
  publishedAt: string;
  createdAt: string;
};

export type SellerAnnouncementListPage = {
  total: number;
  limit: number;
  offset: number;
  announcements: SellerAnnouncement[];
};

export type SellerAnnouncementReadResult = {
  announcementId: number;
  isRead: true;
  readAt: string;
  changed: boolean;
};

const CONTRACT_PREFIX = "announcements_invalid_";

const contractError = (tag: string): Error =>
  new Error(`${CONTRACT_PREFIX}${tag}`);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const read = (obj: Record<string, unknown>, key: string): unknown => {
  if (!(key in obj)) throw contractError(`${key}_missing`);
  return obj[key];
};

const readPositiveInt = (obj: Record<string, unknown>, key: string): number => {
  const value = read(obj, key);
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !Number.isFinite(value) ||
    value < 1
  ) {
    throw contractError(`${key}_shape`);
  }
  return value;
};

const readNonNegativeInt = (
  obj: Record<string, unknown>,
  key: string,
): number => {
  const value = read(obj, key);
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw contractError(`${key}_shape`);
  }
  return value;
};

const readNonEmptyString = (
  obj: Record<string, unknown>,
  key: string,
): string => {
  const value = read(obj, key);
  if (typeof value !== "string" || value.length === 0) {
    throw contractError(`${key}_shape`);
  }
  return value;
};

const readNullableString = (
  obj: Record<string, unknown>,
  key: string,
): string | null => {
  const value = read(obj, key);
  if (value === null) return null;
  if (typeof value !== "string" || value.length === 0) {
    throw contractError(`${key}_shape`);
  }
  return value;
};

const readBoolean = (obj: Record<string, unknown>, key: string): boolean => {
  const value = read(obj, key);
  if (typeof value !== "boolean") throw contractError(`${key}_shape`);
  return value;
};

const parseAudience = (value: unknown): SellerAnnouncementAudience => {
  if (value !== "ALL_SELLERS" && value !== "SELECTED_SELLERS") {
    throw contractError("audience_type");
  }
  return value;
};

export const parseSellerAnnouncement = (raw: unknown): SellerAnnouncement => {
  if (!isObject(raw)) throw contractError("announcement");

  const isRead = readBoolean(raw, "is_read");
  const readAt = readNullableString(raw, "read_at");
  if (isRead !== (readAt !== null)) {
    throw contractError("read_state_mismatch");
  }

  return {
    id: readPositiveInt(raw, "id"),
    title: readNonEmptyString(raw, "title"),
    message: readNonEmptyString(raw, "message"),
    audienceType: parseAudience(read(raw, "audience_type")),
    isRead,
    readAt,
    publishedAt: readNonEmptyString(raw, "published_at"),
    createdAt: readNonEmptyString(raw, "created_at"),
  };
};

export const parseSellerAnnouncementListResponse = (
  raw: unknown,
): SellerAnnouncementListPage => {
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
    announcements: items.map(parseSellerAnnouncement),
  };
};

export const parseSellerAnnouncementReadResponse = (
  raw: unknown,
): SellerAnnouncementReadResult => {
  if (!isObject(raw)) throw contractError("read_response");
  const isRead = readBoolean(raw, "is_read");
  if (!isRead) throw contractError("read_response_state");

  return {
    announcementId: readPositiveInt(raw, "announcement_id"),
    isRead: true,
    readAt: readNonEmptyString(raw, "read_at"),
    changed: readBoolean(raw, "changed"),
  };
};

export const formatAnnouncementDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};
