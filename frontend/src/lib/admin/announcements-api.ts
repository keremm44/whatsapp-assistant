import { apiFetchWithAccessToken } from "@/lib/api/authenticated";

export type AdminAnnouncementAudienceType = "ALL_SELLERS" | "SELECTED_SELLERS";

export type AdminAnnouncementTarget = {
  seller: {
    id: number;
    name: string | null;
    storeName: string | null;
  };
  readAt: string | null;
};

export type AdminAnnouncement = {
  id: number;
  title: string;
  message: string;
  audienceType: AdminAnnouncementAudienceType;
  targetCount: number;
  readCount: number;
  publishedAt: string;
  createdAt?: string;
  targets?: AdminAnnouncementTarget[];
};

export type AdminAnnouncementPage = {
  total: number;
  limit: number;
  offset: number;
  announcements: AdminAnnouncement[];
};

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("admin_announcements_invalid");
  }
  return value as Record<string, unknown>;
};

const string = (row: Record<string, unknown>, key: string) => {
  const value = row[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`admin_announcements_invalid_${key}`);
  }
  return value;
};

const optionalString = (row: Record<string, unknown>, key: string) => {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return string(row, key);
};

const number = (row: Record<string, unknown>, key: string) => {
  const value = row[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`admin_announcements_invalid_${key}`);
  }
  return value;
};

const parseTarget = (value: unknown): AdminAnnouncementTarget => {
  const row = object(value);
  const seller = object(row.seller);
  return {
    seller: {
      id: number(seller, "id"),
      name: optionalString(seller, "name"),
      storeName: optionalString(seller, "store_name"),
    },
    readAt: optionalString(row, "read_at"),
  };
};

const parseAnnouncement = (value: unknown): AdminAnnouncement => {
  const row = object(value);
  const audienceType = string(row, "audience_type");
  if (audienceType !== "ALL_SELLERS" && audienceType !== "SELECTED_SELLERS") {
    throw new Error("admin_announcements_invalid_audience");
  }

  const targetCount = number(row, "target_count");
  const readCount = number(row, "read_count");
  if (readCount > targetCount) {
    throw new Error("admin_announcements_invalid_read_count");
  }

  const result: AdminAnnouncement = {
    id: number(row, "id"),
    title: string(row, "title"),
    message: string(row, "message"),
    audienceType,
    targetCount,
    readCount,
    publishedAt: string(row, "published_at"),
  };

  if (typeof row.created_at === "string" && row.created_at) {
    result.createdAt = row.created_at;
  }

  if (Array.isArray(row.targets)) {
    result.targets = row.targets.map(parseTarget);
    if (result.targets.length !== targetCount) {
      throw new Error("admin_announcements_invalid_targets");
    }
  }

  return result;
};

export async function fetchAdminAnnouncements(
  token: string,
  input: { limit?: number; offset?: number } = {},
): Promise<AdminAnnouncementPage> {
  const limit = input.limit ?? 30;
  const offset = input.offset ?? 0;
  const response = object(
    await apiFetchWithAccessToken<unknown>(
      `/admin/announcements?limit=${limit}&offset=${offset}`,
      token,
      { cache: "no-store" },
    ),
  );
  if (!Array.isArray(response.announcements)) {
    throw new Error("admin_announcements_invalid_list");
  }
  return {
    total: number(response, "total"),
    limit: number(response, "limit"),
    offset: number(response, "offset"),
    announcements: response.announcements.map(parseAnnouncement),
  };
}

export async function fetchAdminAnnouncementDetail(
  token: string,
  id: number,
): Promise<AdminAnnouncement> {
  const response = object(
    await apiFetchWithAccessToken<unknown>(`/admin/announcements/${id}`, token, {
      cache: "no-store",
    }),
  );
  return parseAnnouncement(response.announcement);
}

export async function createAdminAnnouncement(
  token: string,
  title: string,
  message: string,
  sellerIds?: number[],
): Promise<AdminAnnouncement> {
  const response = object(
    await apiFetchWithAccessToken<unknown>("/admin/announcements", token, {
      method: "POST",
      body: JSON.stringify({
        title,
        message,
        audience: sellerIds?.length
          ? { type: "SELECTED_SELLERS", seller_ids: sellerIds }
          : { type: "ALL_SELLERS" },
      }),
      cache: "no-store",
    }),
  );
  return parseAnnouncement(response.announcement);
}
