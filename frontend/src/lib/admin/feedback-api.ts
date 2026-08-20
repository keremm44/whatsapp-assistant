import { apiFetchWithAccessToken } from "@/lib/api/authenticated";
import {
  ADMIN_FEEDBACK_CATEGORIES,
  ADMIN_FEEDBACK_STATUSES,
  type AdminFeedbackCategory,
  type AdminFeedbackStatus,
} from "./feedback-format";

export type AdminFeedback = {
  id: number;
  seller: { id: number; name: string | null; storeName: string | null };
  category: AdminFeedbackCategory;
  subject: string;
  message: string;
  status: AdminFeedbackStatus;
  adminNote: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type AdminFeedbackPage = {
  total: number;
  limit: number;
  offset: number;
  feedback: AdminFeedback[];
};

const statusSet = new Set<string>(ADMIN_FEEDBACK_STATUSES);
const categorySet = new Set<string>(ADMIN_FEEDBACK_CATEGORIES);

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("admin_feedback_invalid");
  }
  return value as Record<string, unknown>;
};

const number = (row: Record<string, unknown>, key: string) => {
  const value = row[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`admin_feedback_invalid_${key}`);
  }
  return value;
};

const string = (row: Record<string, unknown>, key: string) => {
  const value = row[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`admin_feedback_invalid_${key}`);
  }
  return value;
};

const nullableString = (row: Record<string, unknown>, key: string) =>
  row[key] === null ? null : string(row, key);

const parseFeedback = (value: unknown): AdminFeedback => {
  const row = object(value);
  const seller = object(row.seller);
  const status = string(row, "status");
  const category = string(row, "category");
  if (!statusSet.has(status) || !categorySet.has(category)) {
    throw new Error("admin_feedback_invalid_state");
  }
  const resolvedAt = nullableString(row, "resolved_at");
  if ((status === "RESOLVED") !== (resolvedAt !== null)) {
    throw new Error("admin_feedback_invalid_resolved");
  }
  return {
    id: number(row, "id"),
    seller: {
      id: number(seller, "id"),
      name: nullableString(seller, "name"),
      storeName: nullableString(seller, "store_name"),
    },
    category: category as AdminFeedbackCategory,
    subject: string(row, "subject"),
    message: string(row, "message"),
    status: status as AdminFeedbackStatus,
    adminNote: nullableString(row, "admin_note"),
    version: number(row, "version"),
    createdAt: string(row, "created_at"),
    updatedAt: string(row, "updated_at"),
    resolvedAt,
  };
};

export async function fetchAdminFeedback(
  token: string,
  input: {
    status?: AdminFeedbackStatus;
    category?: AdminFeedbackCategory;
    sellerId?: number;
    limit?: number;
    offset?: number;
  } = {},
): Promise<AdminFeedbackPage> {
  const query = new URLSearchParams();
  if (input.status) query.set("status", input.status);
  if (input.category) query.set("category", input.category);
  if (input.sellerId) query.set("seller_id", String(input.sellerId));
  query.set("limit", String(input.limit ?? 30));
  query.set("offset", String(input.offset ?? 0));

  const response = object(
    await apiFetchWithAccessToken<unknown>(`/admin/feedback?${query}`, token, {
      cache: "no-store",
    }),
  );
  if (!Array.isArray(response.feedback)) {
    throw new Error("admin_feedback_invalid_rows");
  }
  return {
    total: number(response, "total"),
    limit: number(response, "limit"),
    offset: number(response, "offset"),
    feedback: response.feedback.map(parseFeedback),
  };
}

export async function fetchAdminFeedbackDetail(token: string, id: number) {
  return parseFeedback(
    object(
      await apiFetchWithAccessToken<unknown>(`/admin/feedback/${id}`, token, {
        cache: "no-store",
      }),
    ).feedback,
  );
}

export async function updateAdminFeedback(
  token: string,
  id: number,
  input: {
    expectedVersion: number;
    status?: AdminFeedbackStatus;
    adminNote?: string;
  },
): Promise<AdminFeedback> {
  const body: {
    expected_version: number;
    status?: AdminFeedbackStatus;
    admin_note?: string;
  } = { expected_version: input.expectedVersion };
  if (input.status) body.status = input.status;
  if (input.adminNote !== undefined) body.admin_note = input.adminNote;
  return parseFeedback(
    object(
      await apiFetchWithAccessToken<unknown>(`/admin/feedback/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify(body),
        cache: "no-store",
      }),
    ).feedback,
  );
}
