/**
 * Server-side seller identity bootstrap.
 *
 * This module is the seller-side companion of `lib/auth/server-access.ts`.
 * Its sole job is to fetch `GET /seller/me` for an already-authenticated
 * active seller and report a small, deliberate state machine:
 *
 *   ready        — backend returned a parseable seller business row.
 *                  `identity.seller.storeName` is the best display
 *                  label the shell should use; it may be null.
 *   unavailable  — backend is currently unreachable, returned 5xx,
 *                  or returned a body that does not match the
 *                  `/seller/me` contract.
 *   auth_rejected — backend said the access token is no longer
 *                  accepted (HTTP 401). This is rare because the
 *                  auth foundation has just resolved the same token
 *                  against `/auth/me`. We surface it explicitly so
 *                  the shell does not pretend the session is fine
 *                  while showing a fake business row.
 *
 * The module is server-only. It does NOT call Supabase signOut. A
 * transient failure here never destroys a valid Supabase session,
 * consistent with the auth foundation's principle.
 *
 * The module does NOT check role / status. Auth is settled before
 * this is invoked; if the caller passes an access token whose
 * `/auth/me` did not yield an active seller, the request will get
 * a 403 from the backend which we map to `unavailable` (the user
 * should be sent to `/giris` by the auth foundation's guard, not
 * by this module).
 */

import { ApiError } from "@/lib/api/client";
import { resolveSession } from "@/lib/supabase/session";
import {
  fetchSellerMe,
  SELLER_ME_CONTRACT_ERROR_PREFIX,
  type SellerMe,
} from "@/lib/seller/me";

/**
 * Bootstrap result. `identity` is present only on `ready`. The shell
 * must handle `unavailable` and `auth_rejected` without signing the
 * user out.
 */
export type SellerBootstrap =
  | { state: "ready"; identity: SellerMe }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

const isAbortError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  return (error as { name?: unknown }).name === "AbortError";
};

const isNetworkError = (error: unknown): boolean => {
  if (isAbortError(error)) return false;
  if (error instanceof TypeError) {
    return /fetch|network|connection|timeout/i.test(error.message);
  }
  if (error instanceof ApiError && error.status === 0) {
    return true;
  }
  return false;
};

const isContractError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return false;
  return message.startsWith(SELLER_ME_CONTRACT_ERROR_PREFIX);
};

/**
 * Resolve the seller bootstrap for the current request. The caller
 * passes a Supabase access token that the auth foundation has just
 * used to read `/auth/me`. We never read Supabase here directly.
 */
export const resolveSellerBootstrap = async (
  accessToken: string,
): Promise<SellerBootstrap> => {
  try {
    const identity = await fetchSellerMe(accessToken, {
      cache: "no-store",
    });
    return { state: "ready", identity };
  } catch (error) {
    if (isContractError(error) || isNetworkError(error)) {
      return { state: "unavailable" };
    }
    if (error instanceof ApiError) {
      if (error.status === 401) {
        return { state: "auth_rejected" };
      }
      // 403/404 here mean the backend authenticated us but did not
      // find / has not activated the seller. The auth foundation
      // would have already redirected an application_rejected
      // user. If we get here with 403/404 it means the auth state
      // changed mid-request; treat as unavailable rather than
      // destroying the session.
      if (error.status === 403 || error.status === 404) {
        return { state: "unavailable" };
      }
      if (error.status >= 500) {
        return { state: "unavailable" };
      }
    }
    return { state: "unavailable" };
  }
};

/**
 * Pick the display label for the seller shell's topbar. Pure
 * function: ready + non-null storeName -> the real name; ready + null
 * -> the generic fallback; unavailable / auth_rejected -> the
 * generic fallback. The fallback is a single constant so a future
 * copy change is local.
 */
export const FALLBACK_SELLER_LABEL = "Mağaza";

export const pickSellerDisplayName = (
  bootstrap: SellerBootstrap,
): string => {
  if (bootstrap.state !== "ready") {
    return FALLBACK_SELLER_LABEL;
  }
  const name = bootstrap.identity.seller.storeName;
  if (typeof name === "string" && name.trim().length > 0) {
    return name.trim();
  }
  return FALLBACK_SELLER_LABEL;
};

/**
 * Session-aware variant. Reads the current Supabase session's access
 * token from the server-side cookies and forwards it to
 * `resolveSellerBootstrap`. The token is read via
 * `supabase.auth.getSession()` — the same call the auth foundation
 * uses — so the access token is consistent with the one that was
 * just used to verify `/auth/me`.
 *
 * Returns `state: "unavailable"` if the session lookup itself
 * fails (network, abort, SDK error). It is the caller's
 * responsibility to gate this call behind an already-passed auth
 * guard; this helper does NOT assert role / status.
 */
export const resolveSellerBootstrapFromSession =
  async (): Promise<SellerBootstrap> => {
    const session = await resolveSession();
    if (!session) return { state: "unavailable" };
    return resolveSellerBootstrap(session.accessToken);
  };
