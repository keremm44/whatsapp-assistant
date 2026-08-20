import { apiFetchWithAccessToken } from "@/lib/api/authenticated";

export type AdminApplication = {
  id: number;
  fullName: string;
  storeName: string;
  phone: string;
  email: string | null;
  storeLink: string | null;
  productCategory: string | null;
  notes: string | null;
  adminNote: string | null;
  status: "pending" | "contacted" | "approved" | "rejected" | "cancelled";
  createdAt: string;
};

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("admin_applications_invalid");
  }
  return value as Record<string, unknown>;
};

const string = (row: Record<string, unknown>, key: string) => {
  const value = row[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`admin_applications_invalid_${key}`);
  }
  return value;
};

const nullableString = (row: Record<string, unknown>, key: string) =>
  row[key] === null || row[key] === undefined ? null : string(row, key);

const parseApplication = (value: unknown): AdminApplication => {
  const row = object(value);
  const id = row.id;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1) {
    throw new Error("admin_applications_invalid_id");
  }
  const status = string(row, "status");
  if (!["pending", "contacted", "approved", "rejected", "cancelled"].includes(status)) {
    throw new Error("admin_applications_invalid_status");
  }
  return {
    id,
    fullName: string(row, "full_name"),
    storeName: string(row, "store_name"),
    phone: string(row, "phone"),
    email: nullableString(row, "email"),
    storeLink: nullableString(row, "store_link"),
    productCategory: nullableString(row, "product_category"),
    notes: nullableString(row, "notes"),
    adminNote: nullableString(row, "admin_note"),
    status: status as AdminApplication["status"],
    createdAt: string(row, "created_at"),
  };
};

export async function fetchAdminApplications(
  token: string,
  status?: AdminApplication["status"],
): Promise<{ total: number; applications: AdminApplication[] }> {
  const query = new URLSearchParams({ limit: "500" });
  if (status) query.set("status", status);
  const response = object(
    await apiFetchWithAccessToken<unknown>(`/admin/applications?${query}`, token, {
      cache: "no-store",
    }),
  );
  if (!Array.isArray(response.applications) || typeof response.toplam !== "number") {
    throw new Error("admin_applications_invalid_list");
  }
  return {
    total: response.toplam,
    applications: response.applications.map(parseApplication),
  };
}

export const inviteAdminApplication = async (
  token: string,
  id: number,
  input: { email?: string; adminNote?: string },
) =>
  apiFetchWithAccessToken<unknown>(`/admin/applications/${id}/invite`, token, {
    method: "POST",
    body: JSON.stringify({
      email: input.email || undefined,
      admin_note: input.adminNote || undefined,
    }),
    cache: "no-store",
  });
