/**
 * Server-only application access resolver.
 *
 * This module is the single source of truth for "what is this user's
 * current application authorization state?" for every server-rendered
 * protected surface (seller layout, admin layout, future login page
 * session-redirect logic, future logout flow, etc.).
 *
 * It deliberately does NOT consult:
 *   - Supabase user_metadata
 *   - Supabase app_metadata
 *   - JWT app_role claims
 *   - localStorage / sessionStorage
 *   - custom role cookies
 *   - query parameters
 *
 * The Supabase session is treated strictly as an authentication
 * identity source. The application role / status is always resolved
 * by sending the access token to the FastAPI `GET /auth/me` endpoint,
 * which is the single trusted role/status source per the product
 * architecture.
 *
 * This module must never be imported by a Client Component. The
 * underlying Supabase client (`createSupabaseServerClient`) and the
 * Next.js redirect helpers it depends on are server-only.
 */

import type { Route } from "next";
import { redirect } from "next/navigation";
import {
  AuthRetryableFetchError,
  isAuthError,
  isAuthSessionMissingError,
} from "@supabase/auth-js";

import { ApiError } from "@/lib/api/client";
import { fetchAuthMe, type AuthMe } from "@/lib/auth/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The four explicit resolver states.
 *
 * The split matters because "no Supabase session" and "Supabase session
 * present but the backend / Supabase service is currently unreachable"
 * are fundamentally different experiences for the seller:
 *   - unauthenticated       -> redirect to /giris
 *   - application_rejected  -> redirect to /giris (with calm message)
 *   - unavailable            -> stay where you are, render a neutral
 *                              retry UI, do NOT signOut, do NOT redirect
 *   - authorized             -> render the protected surface
 */
export type ServerAccess =
  | { state: "unauthenticated" }
  | { state: "authorized"; me: AuthMe }
  | { state: "application_rejected" }
  | { state: "unavailable" };

const LOGIN_PATH: Route = "/giris";
const SELLER_PATH: Route = "/seller";
const ADMIN_PATH: Route = "/admin";

/**
 * Heuristic detection of Supabase "service is currently unreachable"
 * errors. We treat these as `unavailable`, not `unauthenticated`, so
 * the user does not get silently logged out during a transient
 * Supabase outage.
 */
const isSupabaseUnavailableError = (error: unknown): boolean => {
  if (isAuthError(error) && error instanceof AuthRetryableFetchError) {
    return true;
  }
  if (typeof error === "object" && error !== null) {
    const name = (error as { name?: unknown }).name;
    if (name === "AbortError") return false;
    if (error instanceof TypeError) {
      // fetch failures surface as TypeError("Failed to fetch") or similar.
      return /fetch|network|connection|timeout/i.test(error.message);
    }
  }
  return false;
};

/**
 * Heuristic detection of the parser-level contract errors raised by
 * `lib/auth/me.ts`. These are NOT network failures: the HTTP request
 * completed, the backend returned 2xx, but the body did not match
 * the agreed /auth/me contract. We treat them as `unavailable` so
 * the user is not pushed to /giris over a backend/frontend contract
 * mismatch.
 */
const isAuthMeContractError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return false;
  return message.startsWith("auth_me_invalid_");
};

/**
 * Heuristic detection of fetch / network errors from the apiFetch
 * wrapper. Mirrors the pattern in lib/auth/errors.ts.
 */
const isFetchNetworkError = (error: unknown): boolean => {
  if (typeof error === "object" && error === null) return false;
  if (typeof error === "object") {
    const name = (error as { name?: unknown }).name;
    if (name === "AbortError") return false;
    if (error instanceof TypeError) {
      return /fetch|network|connection|timeout/i.test(error.message);
    }
    if (error instanceof ApiError && error.status === 0) {
      return true;
    }
  }
  return false;
};

/**
 * Resolve the current user's application access state. Used by the
 * seller and admin server layouts, and reused by the login page
 * (in 3A.3.2) and the logout flow (in 3A.3.3).
 *
 * The resolver:
 *   1. Verifies a Supabase user via `auth.getUser()`. Cookie-only
 *      state is not trusted; a verified user from the GoTrue server
 *      is required.
 *   2. Resolves the current access token via `auth.getSession()`.
 *   3. Calls `GET /auth/me` with the token, with `cache: "no-store"`
 *      so the per-user authorization response is never shared.
 *
 * On any failure, the resolver returns one of:
 *   - unauthenticated       (real invalid/expired session)
 *   - application_rejected  (backend refused the application access)
 *   - unavailable            (transient Supabase / backend problem)
 *
 * It NEVER calls Supabase signOut. The user is never silently
 * logged out by the resolver.
 */
export const resolveServerAccess = async (): Promise<ServerAccess> => {
  const supabase = await createSupabaseServerClient();

  let user;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    if (isSupabaseUnavailableError(error)) {
      return { state: "unavailable" };
    }
    if (isAuthSessionMissingError(error)) {
      return { state: "unauthenticated" };
    }
    if (isAuthError(error)) {
      // Any other auth error: be conservative and surface as
      // unavailable rather than forcing a logout.
      return { state: "unavailable" };
    }
    return { state: "unavailable" };
  }

  if (!user) {
    return { state: "unauthenticated" };
  }

  let accessToken: string | null = null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      // We already verified the user above, so a session lookup
      // failure here is a real edge case. Treat as unavailable.
      return { state: "unavailable" };
    }
    accessToken = data.session?.access_token ?? null;
  } catch (error) {
    if (isSupabaseUnavailableError(error)) {
      return { state: "unavailable" };
    }
    return { state: "unavailable" };
  }

  if (!accessToken) {
    // User verified but no session token. This is a real edge case
    // (e.g. concurrent signOut). Do NOT classify as unauthenticated;
    // surface as unavailable so we don't sign the user out.
    return { state: "unavailable" };
  }

  let me;
  try {
    me = await fetchAuthMe(accessToken, { cache: "no-store" });
  } catch (error) {
    if (isAuthMeContractError(error)) {
      return { state: "unavailable" };
    }
    if (isFetchNetworkError(error)) {
      return { state: "unavailable" };
    }
    if (error instanceof ApiError) {
      if (error.status === 401) {
        return { state: "unauthenticated" };
      }
      if (error.status === 403 || error.status === 404) {
        return { state: "application_rejected" };
      }
      if (error.status >= 500) {
        return { state: "unavailable" };
      }
    }
    return { state: "unavailable" };
  }

  return { state: "authorized", me };
};

/**
 * Helper: redirect a server component to a fixed path using Next's
 * `redirect()`. Centralized so the four routes (/giris, /seller,
 * /admin) are not hardcoded in every layout.
 */
const redirectTo = (path: Route): never => {
  redirect(path);
};

/**
 * Apply the seller layout's authorization matrix to a resolved
 * ServerAccess state. This is the single place where the
 * seller-protection decision is encoded.
 *
 *   unauthenticated      -> /giris
 *   authorized seller     -> render the seller shell
 *   authorized admin      -> /admin
 *   application_rejected  -> /giris
 *   unavailable           -> caller renders the neutral retry UI
 *
 * The function returns either:
 *   - "allow"             with the verified AuthMe, OR
 *   - "show_unavailable"  so the caller renders a small retry UI.
 *
 * It never returns for "unauthenticated" / "application_rejected" /
 * "authorized admin" because those branches redirect (which throws
 * inside Next.js, terminating the render).
 */
export type SellerGuardResult =
  | { kind: "allow"; me: AuthMe }
  | { kind: "show_unavailable" };

export const applySellerGuard = (
  access: ServerAccess,
): SellerGuardResult => {
  switch (access.state) {
    case "unauthenticated":
      return redirectTo(LOGIN_PATH);
    case "application_rejected":
      return redirectTo(LOGIN_PATH);
    case "unavailable":
      return { kind: "show_unavailable" };
    case "authorized": {
      const { me } = access;
      if (me.role === "admin" && me.status === "active") {
        return redirectTo(ADMIN_PATH);
      }
      if (
        me.role === "seller" &&
        me.status === "active" &&
        me.sellerId !== null
      ) {
        return { kind: "allow", me };
      }
      return redirectTo(LOGIN_PATH);
    }
  }
};

/**
 * Apply the admin layout's authorization matrix.
 *
 *   unauthenticated      -> /giris
 *   authorized admin      -> render the admin content
 *   authorized seller     -> /seller
 *   application_rejected  -> /giris
 *   unavailable           -> caller renders the neutral retry UI
 */
export type AdminGuardResult =
  | { kind: "allow"; me: AuthMe }
  | { kind: "show_unavailable" };

export const applyAdminGuard = (access: ServerAccess): AdminGuardResult => {
  switch (access.state) {
    case "unauthenticated":
      return redirectTo(LOGIN_PATH);
    case "application_rejected":
      return redirectTo(LOGIN_PATH);
    case "unavailable":
      return { kind: "show_unavailable" };
    case "authorized": {
      const { me } = access;
      if (me.role === "admin" && me.status === "active") {
        return { kind: "allow", me };
      }
      if (me.role === "seller" && me.status === "active") {
        return redirectTo(SELLER_PATH);
      }
      return redirectTo(LOGIN_PATH);
    }
  }
};
