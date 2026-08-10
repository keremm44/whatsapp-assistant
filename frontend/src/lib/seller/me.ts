/**
 * Authenticated lookup of the current seller's business identity.
 *
 * This module is the seller-side analogue of `lib/auth/me.ts`. The
 * backend `GET /seller/me` route is the single source of truth for
 * the seller's business row (store name, phone, onboarding flags,
 * access metadata). The frontend never reads the `public.sellers`
 * table directly and never infers a store name from the Supabase
 * session, user metadata, JWT claims, or any other client-side
 * signal.
 *
 * IMPORTANT: This module is NOT responsible for authentication or
 * authorization. `/auth/me` remains the only authority for role,
 * status, and seller_id. `/seller/me` is consulted ONLY after the
 * auth foundation has already verified an active seller session and
 * is used solely to render the seller shell's bootstrap identity.
 *
 * Module is server-only because it depends on the authenticated API
 * wrapper, which is currently invoked from Server Components
 * (`seller/layout.tsx`). It does not import the Supabase clients.
 */

import { apiFetchWithAccessToken } from "@/lib/api/authenticated";

/**
 * Subset of the seller business row that the seller shell actually
 * consumes today. The backend returns the full `sellers` row
 * (`select("*")` in `database.get_seller_by_id`); we type only the
 * fields the shell reads and treat everything else as opaque
 * metadata, which keeps the type honest if the schema grows.
 *
 * `store_name` is the business-facing display label. The seller
 * shell renders it as the topbar's identity; if it is missing or
 * empty the shell falls back to the generic "Mağaza" label.
 */
export type SellerBusinessIdentity = {
  id: number;
  storeName: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  storeLink: string | null;
};

/**
 * Backend-supported `system_status` values, mirrored from
 * `chk_sellers_system_status`. The parser will reject any value
 * outside this set with a `seller_me_invalid_access_system_status_value`
 * contract error.
 */
export type SellerSystemStatus =
  | "onboarding"
  | "admin_review_pending"
  | "automatic_validation"
  | "beta_active"
  | "active"
  | "suspended"
  | "cancelled";

/**
 * The `access` object the backend attaches to `/seller/me`. The
 * seller shell does not render any of these today, but the frontend
 * reads them so a future surface (settings, dashboard tasks) can
 * consume them without re-fetching.
 */
export type SellerAccess = {
  role: "seller" | "admin";
  sellerId: number;
  onboardingCompleted: boolean;
  systemStatus: SellerSystemStatus;
  aiEnabled: boolean;
};

export type SellerMe = {
  seller: SellerBusinessIdentity;
  access: SellerAccess;
};

/**
 * Parser-level error tags. These follow the same convention as
 * `auth_me_invalid_*` and are consumed by the bootstrap layer to
 * distinguish "backend said something we cannot understand" from
 * "backend is currently unreachable".
 */
const SELLER_ME_CONTRACT_PREFIX = "seller_me_invalid_";

/**
 * Backend-supported `system_status` values. Mirrored from the
 * `chk_sellers_system_status` check constraint in
 * `migrations/009_seller_access_and_applications.sql`. The frontend
 * never invents additional values; an unknown system_status is
 * a contract error and the bootstrap returns `unavailable`.
 */
const VALID_SYSTEM_STATUSES: ReadonlySet<string> = new Set([
  "onboarding",
  "admin_review_pending",
  "automatic_validation",
  "beta_active",
  "active",
  "suspended",
  "cancelled",
]);

const isSellerAccessRole = (value: unknown): value is "seller" | "admin" =>
  value === "seller" || value === "admin";

const isSellerSystemStatus = (
  value: unknown,
): value is SellerSystemStatus =>
  typeof value === "string" && VALID_SYSTEM_STATUSES.has(value);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseSellerBusiness = (raw: unknown): SellerBusinessIdentity => {
  if (!isPlainObject(raw)) {
    throw new Error(`${SELLER_ME_CONTRACT_PREFIX}response`);
  }

  const idRaw = raw.id;
  const id =
    typeof idRaw === "number" && Number.isFinite(idRaw) ? idRaw : null;
  if (id === null) {
    throw new Error(`${SELLER_ME_CONTRACT_PREFIX}id`);
  }

  const stringOrNull = (value: unknown): string | null => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return null;
  };

  return {
    id,
    storeName: stringOrNull(raw.store_name),
    name: stringOrNull(raw.name),
    email: stringOrNull(raw.email),
    phone: stringOrNull(raw.phone),
    storeLink: stringOrNull(raw.store_link),
  };
};

const parseSellerAccess = (raw: unknown): SellerAccess => {
  if (!isPlainObject(raw)) {
    throw new Error(`${SELLER_ME_CONTRACT_PREFIX}access`);
  }

  const role = raw.role;
  if (!isSellerAccessRole(role)) {
    throw new Error(`${SELLER_ME_CONTRACT_PREFIX}access_role`);
  }

  const sellerIdRaw = raw.seller_id;
  const sellerId =
    typeof sellerIdRaw === "number" && Number.isFinite(sellerIdRaw)
      ? sellerIdRaw
      : null;
  if (sellerId === null) {
    throw new Error(`${SELLER_ME_CONTRACT_PREFIX}access_seller_id`);
  }

  // The `access` block is the backend's authoritative projection of
  // the seller's business + access state. The frontend never
  // invents values when the backend contract is silent. If a
  // field is missing, malformed, or holds a value outside the
  // supported set, the entire /seller/me response is treated as
  // a contract violation — the bootstrap layer maps that to
  // `state: "unavailable"`.
  //
  // We do NOT default missing booleans to `false` or missing
  // status strings to `"unknown"`. Frontend-only defaults would
  // silently turn a backend contract regression into a
  // falsely-healthy seller shell, which is exactly what the
  // bootstrap layer's recoverable-unavailable surface is meant
  // to prevent.
  if (typeof raw.onboarding_completed !== "boolean") {
    throw new Error(`${SELLER_ME_CONTRACT_PREFIX}access_onboarding_completed`);
  }

  if (typeof raw.system_status !== "string") {
    throw new Error(`${SELLER_ME_CONTRACT_PREFIX}access_system_status_type`);
  }
  if (!isSellerSystemStatus(raw.system_status)) {
    throw new Error(`${SELLER_ME_CONTRACT_PREFIX}access_system_status_value`);
  }

  if (typeof raw.ai_enabled !== "boolean") {
    throw new Error(`${SELLER_ME_CONTRACT_PREFIX}access_ai_enabled`);
  }

  return {
    role,
    sellerId,
    onboardingCompleted: raw.onboarding_completed,
    systemStatus: raw.system_status,
    aiEnabled: raw.ai_enabled,
  };
};

const parseSellerMe = (raw: unknown): SellerMe => {
  if (!isPlainObject(raw)) {
    throw new Error(`${SELLER_ME_CONTRACT_PREFIX}response`);
  }

  const seller = parseSellerBusiness(raw.seller);
  const access = parseSellerAccess(raw.access);

  // Cross-field invariant: a seller's access.sellerId must match
  // the business row's id. We never trust one side over the other
  // because the auth foundation already enforced that
  // /auth/me.sellerId is a positive int; this catches a contract
  // regression where the two drift.
  if (access.sellerId !== seller.id) {
    throw new Error(`${SELLER_ME_CONTRACT_PREFIX}id_mismatch`);
  }

  return { seller, access };
};

export type FetchSellerMeOptions = {
  signal?: AbortSignal;
  /**
   * Optional `RequestInit.cache` value. Per-user business identity
   * must never be served from a shared cache.
   */
  cache?: RequestCache;
};

/**
 * Fetch and parse `GET /seller/me`. The caller must already hold a
 * valid Supabase access token (the auth foundation has resolved an
 * active seller session). The token is forwarded as a Bearer.
 */
export const fetchSellerMe = async (
  accessToken: string,
  options?: FetchSellerMeOptions,
): Promise<SellerMe> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    "/seller/me",
    accessToken,
    {
      signal: options?.signal,
      cache: options?.cache ?? "no-store",
    },
  );
  return parseSellerMe(raw);
};

/**
 * Exported so the bootstrap layer can map `seller_me_invalid_*`
 * errors to `state: "unavailable"` without hard-coding the prefix.
 */
export const SELLER_ME_CONTRACT_ERROR_PREFIX = SELLER_ME_CONTRACT_PREFIX;
