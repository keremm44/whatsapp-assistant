/**
 * Authenticated lookup of the current user's application identity.
 *
 * The single source of truth for the frontend is the backend
 * `GET /auth/me` response. The frontend never infers the role, status,
 * or seller_id from the Supabase session, user metadata, JWT claims,
 * or any other client-side signal.
 */

import { apiFetchWithAccessToken } from "@/lib/api/authenticated";

export type AuthMeRole = "seller" | "admin";

export type AuthMe = {
  authUserId: string;
  email: string | null;
  role: AuthMeRole;
  status: string;
  sellerId: number | null;
  profile: Record<string, unknown>;
};

const isAuthMeRole = (value: unknown): value is AuthMeRole =>
  value === "seller" || value === "admin";

const parseAuthMe = (raw: unknown): AuthMe => {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("auth_me_invalid_response");
  }
  const record = raw as Record<string, unknown>;
  const role = record.role;
  if (!isAuthMeRole(role)) {
    throw new Error("auth_me_invalid_role");
  }
  const authUserId = record.auth_user_id;
  if (typeof authUserId !== "string" || authUserId.length === 0) {
    throw new Error("auth_me_invalid_user");
  }
  const sellerIdRaw = record.seller_id;
  const sellerId =
    typeof sellerIdRaw === "number" && Number.isFinite(sellerIdRaw)
      ? sellerIdRaw
      : null;
  const status =
    typeof record.status === "string" ? record.status : "unknown";
  const email = typeof record.email === "string" ? record.email : null;
  const profile =
    typeof record.profile === "object" && record.profile !== null
      ? (record.profile as Record<string, unknown>)
      : {};
  return {
    authUserId,
    email,
    role,
    status,
    sellerId,
    profile,
  };
};

export type FetchAuthMeOptions = {
  signal?: AbortSignal;
  /**
   * Optional `RequestInit.cache` value. Authorization responses are
   * user-specific and must never be served from a shared cache.
   * Server-side callers (route guards) should pass
   * `cache: "no-store"` explicitly. The default of "no-store" inside
   * this helper preserves that contract.
   */
  cache?: RequestCache;
};

export const fetchAuthMe = async (
  accessToken: string,
  options?: FetchAuthMeOptions,
): Promise<AuthMe> => {
  const raw = await apiFetchWithAccessToken<unknown>("/auth/me", accessToken, {
    signal: options?.signal,
    cache: options?.cache ?? "no-store",
  });
  return parseAuthMe(raw);
};
