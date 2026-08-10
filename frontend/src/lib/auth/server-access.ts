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
 * The three protected route constants. Exported so the login page
 * (and any future server-side redirector) can reference them with
 * the same `Route` typing without re-declaring string literals.
 */
export const PROTECTED_ROUTES = {
  login: LOGIN_PATH,
  seller: SELLER_PATH,
  admin: ADMIN_PATH,
} as const;

/**
 * Minimal shape-based view of a Supabase auth error.
 *
 * We deliberately do NOT import `@supabase/auth-js` here. That
 * package is a transitive dependency of `@supabase/supabase-js` and
 * is not declared as a direct dependency of this frontend. The
 * error shape we need is small and stable (`name`, `status`, `code`,
 * and a private `__isAuthError` brand on the base AuthError class).
 *
 * Inspection of these fields lets us classify:
 *   - definite invalid session  -> unauthenticated
 *   - definite service outage   -> unavailable
 *   - anything else             -> unavailable (conservative)
 *
 * The `@supabase/auth-js` 2.x source confirms every AuthError
 * subclass is a normal Error with `name`, `status`, and `code`. The
 * base class also brands itself with a non-enumerable
 * `__isAuthError = true` we use here to distinguish auth errors
 * from arbitrary thrown values.
 */
type SupabaseAuthErrorShape = {
  name?: unknown;
  status?: unknown;
  code?: unknown;
  __isAuthError?: unknown;
  message?: unknown;
};

const isAuthError = (error: unknown): error is SupabaseAuthErrorShape => {
  if (typeof error !== "object" || error === null) return false;
  // Match `@supabase/auth-js`'s own `isAuthError`: check for the
  // presence of the `__isAuthError` brand on the object. We use
  // the `in` operator to be tolerant of non-enumerable assignment
  // and to also catch instances where the field is set on the
  // prototype chain.
  return "__isAuthError" in (error as Record<string, unknown>);
};

const errorName = (error: SupabaseAuthErrorShape): string =>
  typeof error.name === "string" ? error.name : "";

const errorCode = (error: SupabaseAuthErrorShape): string | null =>
  typeof error.code === "string" && error.code.length > 0
    ? error.code
    : null;

const errorStatus = (error: SupabaseAuthErrorShape): number | null =>
  typeof error.status === "number" && Number.isFinite(error.status)
    ? error.status
    : null;

/**
 * Supabase error names that mean "there is no (usable) session for
 * this request". All map to `unauthenticated`.
 */
const SUPABASE_SESSION_MISSING_NAMES = new Set<string>([
  "AuthSessionMissingError",
  "AuthInvalidTokenResponseError",
  "AuthInvalidJwtError",
  "AuthInvalidCredentialsError",
  "AuthPKCECodeVerifierMissingError",
]);

/**
 * Supabase error names / codes that mean "Supabase itself is
 * currently unreachable / retryable". All map to `unavailable`.
 */
const SUPABASE_RETRYABLE_NAMES = new Set<string>([
  "AuthRetryableFetchError",
  "AuthRefreshDiscardedError",
]);

/**
 * Result of classifying a single Supabase error. We never throw from
 * inside the resolver's classification step; we always return one of
 * the three known categories or `unavailable` as a conservative
 * default.
 */
type SupabaseErrorClass = "unauthenticated" | "unavailable";

/**
 * Classify a Supabase error WITHOUT relying on the undeclared
 * `@supabase/auth-js` package. We only inspect the documented
 * public error shape (name, status, code, message).
 *
 * Conservative default: if we cannot prove the error is an
 * "invalid session" error, we treat it as `unavailable`. The
 * resolver MUST NOT classify a transient network error as
 * `unauthenticated` — otherwise the user gets silently signed
 * out during a Supabase outage.
 */
const classifySupabaseAuthError = (error: unknown): SupabaseErrorClass => {
  if (!isAuthError(error)) {
    // Non-auth Supabase errors (e.g. network TypeError) and any
    // unbranded thrown value fall through to "unavailable".
    if (error instanceof TypeError) {
      if (/fetch|network|connection|timeout/i.test(error.message)) {
        return "unavailable";
      }
    }
    return "unavailable";
  }

  const name = errorName(error);
  const status = errorStatus(error);
  const code = errorCode(error);

  if (SUPABASE_SESSION_MISSING_NAMES.has(name)) {
    return "unauthenticated";
  }

  if (SUPABASE_RETRYABLE_NAMES.has(name)) {
    return "unavailable";
  }

  // AuthApiError carries an HTTP status. 401/403 from GoTrue on
  // getUser() means the cookie's session token is rejected ->
  // unauthenticated. Any other HTTP status (5xx in particular) is
  // treated as a Supabase availability problem, not a user error.
  if (name === "AuthApiError") {
    if (status === 401 || status === 403) {
      return "unauthenticated";
    }
    if (status !== null && status >= 500) {
      return "unavailable";
    }
  }

  // For names we did not explicitly whitelist, fall back to the
  // conservative default. Even `error.name === "AuthError"` (the
  // generic base) is treated as "we could not prove a missing
  // session" -> unavailable. This is the point.
  //
  // Exceptions are explicit known codes from AuthApiError-style
  // responses that the GoTrue server uses to signal an
  // unrecoverable invalid grant.
  if (code === "invalid_grant" || code === "invalid_token") {
    return "unauthenticated";
  }
  if (typeof code === "string" && code.startsWith("refresh_token_")) {
    return "unauthenticated";
  }

  return "unavailable";
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
 * Classify the resolved `error` field of `supabase.auth.getUser()`.
 * Returns:
 *   "unauthenticated"  when the error definitively means the
 *                       session is missing or rejected.
 *   "unavailable"       for any other failure (network, 5xx,
 *                       unknown error shape, etc.).
 *
 * `getUser()` resolves (not throws) when GoTrue rejects the
 * session. Throws are reserved for hard network / SDK failures.
 */
const classifyGetUserError = (error: unknown): SupabaseErrorClass => {
  if (isAuthError(error)) {
    return classifySupabaseAuthError(error);
  }
  // Unbranded error from getUser(). This is rare; in practice
  // getUser() always returns an AuthError or throws.
  if (error instanceof TypeError) {
    if (/fetch|network|connection|timeout/i.test(error.message)) {
      return "unavailable";
    }
  }
  return "unavailable";
};

/**
 * Resolve the current user's application access state. Used by the
 * seller and admin server layouts, and reused by the login page
 * (in 3A.3.2) and the logout flow (in 3A.3.3).
 *
 * The resolver:
 *   1. Verifies a Supabase user via `auth.getUser()`. Cookie-only
 *      state is not trusted; a verified user from the GoTrue server
 *      is required. The `result.error` field is always inspected
 *      explicitly — a successful `result.data.user` being null is
 *      not enough to conclude the session is invalid; an explicit
 *      auth error is required.
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

  // Step 1: verify the Supabase user.
  //
  // getUser() normally RESOLVES with `{ data: { user: ... }, error }`
  // — a rejected session is reported via `error`, not via throw.
  // We must inspect `error` explicitly; treating `data.user === null`
  // as the only signal would misclassify a Supabase outage as
  // "unauthenticated" and trigger a signOut / redirect we never want.
  let getUserResult: Awaited<
    ReturnType<Awaited<ReturnType<typeof createSupabaseServerClient>>["auth"]["getUser"]>
  >;
  try {
    getUserResult = await supabase.auth.getUser();
  } catch {
    // Real thrown exception from the SDK (network, abort, etc.).
    // Be conservative: this is almost never an "invalid session"
    // case — it is a Supabase availability problem.
    return { state: "unavailable" };
  }

  const { data, error: getUserError } = getUserResult;

  if (getUserError) {
    const kind = classifyGetUserError(getUserError);
    if (kind === "unauthenticated") {
      return { state: "unauthenticated" };
    }
    return { state: "unavailable" };
  }

  if (!data || !data.user) {
    // No error and no user: there is genuinely no session.
    return { state: "unauthenticated" };
  }

  // Step 2: read the access token from the live session.
  let accessToken: string | null = null;
  try {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) {
      // We already verified the user above, so a session lookup
      // failure here is a real edge case. Treat as unavailable.
      return { state: "unavailable" };
    }
    accessToken = sessionData.session?.access_token ?? null;
  } catch {
    return { state: "unavailable" };
  }

  if (!accessToken) {
    // User verified but no session token. This is a real edge case
    // (e.g. concurrent signOut). Do NOT classify as unauthenticated;
    // surface as unavailable so we don't sign the user out.
    return { state: "unavailable" };
  }

  // Step 3: ask the backend for the application role / status.
  let me: AuthMe;
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
