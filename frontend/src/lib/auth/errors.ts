/**
 * Auth error categories.
 *
 * The login surface never shows raw Supabase messages or raw FastAPI
 * error bodies. Instead, the auth flow classifies failures into a small
 * set of categories the UI can render with calm, consistent copy.
 *
 *   - invalid_credentials: Supabase definitively rejected the
 *                          email/password pair (known grant-rejection
 *                          code, e.g. invalid_grant).
 *   - access_rejected:    Supabase login succeeded but the backend
 *                          refused the application access (401, 403, or
 *                          404 from /auth/me — no profile, inactive
 *                          profile, or invalid role).
 *   - network:            Request could not reach the backend, or the
 *                          backend returned 5xx, or the response could
 *                          not be parsed.
 *   - unknown:            Anything else.
 *
 * The Supabase classifier is intentionally narrow: it only treats
 * KNOWN credential-rejection error codes as `invalid_credentials`.
 * Unknown 4xx responses from Supabase do not default to that
 * category — they fall through to the generic login failure message
 * so the user is not misled about why the attempt failed.
 */

import { ApiError } from "@/lib/api/client";

export type AuthErrorCategory =
  | "invalid_credentials"
  | "access_rejected"
  | "network"
  | "unknown";

export type ClassifiedAuthError = {
  category: AuthErrorCategory;
  message: string;
};

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCategory, string> = {
  invalid_credentials:
    "E-posta veya şifre doğru görünmüyor. Tekrar kontrol edebilirsiniz.",
  access_rejected:
    "Bu hesap henüz kullanıma hazır değil.",
  network: "Giriş şu anda tamamlanamadı. Lütfen tekrar deneyin.",
  unknown: "Giriş şu anda tamamlanamadı. Lütfen tekrar deneyin.",
};

/**
 * Supabase error codes that definitively mean the email/password pair
 * was rejected by the auth server. Anything outside this set is treated
 * as a generic login failure so we never tell the user their password
 * is wrong when the actual cause is unknown.
 */
const SUPABASE_CREDENTIAL_REJECTION_CODES = new Set<string>([
  "invalid_grant",
  "invalid_credentials",
  "invalid_login_credentials",
  "email_not_confirmed",
]);

const isAbortError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError";
};

const isNetworkError = (error: unknown): boolean => {
  if (isAbortError(error)) return false;
  if (error instanceof TypeError) {
    // fetch failures surface as TypeError("Failed to fetch") or similar.
    return /fetch|network|connection/i.test(error.message);
  }
  if (error instanceof ApiError) {
    return error.status === 0;
  }
  return false;
};

export const classifySupabaseError = (error: unknown): ClassifiedAuthError => {
  if (isAbortError(error)) {
    return { category: "unknown", message: AUTH_ERROR_MESSAGES.unknown };
  }
  if (isNetworkError(error)) {
    return { category: "network", message: AUTH_ERROR_MESSAGES.network };
  }
  const code =
    typeof error === "object" && error !== null
      ? (error as { code?: unknown }).code
      : undefined;

  if (typeof code === "string" && SUPABASE_CREDENTIAL_REJECTION_CODES.has(code)) {
    return {
      category: "invalid_credentials",
      message: AUTH_ERROR_MESSAGES.invalid_credentials,
    };
  }

  // Any other shape (unknown code, unknown 4xx, malformed error object)
  // surfaces the generic login failure message. We do NOT widen this
  // branch to "any 4xx" because the user should not be told their
  // password is wrong when the cause is something else.
  return { category: "unknown", message: AUTH_ERROR_MESSAGES.unknown };
};

export const classifyBackendRejection = (
  error: unknown,
): ClassifiedAuthError => {
  if (isAbortError(error)) {
    return { category: "unknown", message: AUTH_ERROR_MESSAGES.unknown };
  }
  if (isNetworkError(error)) {
    return { category: "network", message: AUTH_ERROR_MESSAGES.network };
  }
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return {
        category: "access_rejected",
        message: AUTH_ERROR_MESSAGES.access_rejected,
      };
    }
    if (error.status === 404) {
      return {
        category: "access_rejected",
        message: AUTH_ERROR_MESSAGES.access_rejected,
      };
    }
    if (error.status >= 500) {
      return { category: "network", message: AUTH_ERROR_MESSAGES.network };
    }
  }
  return { category: "unknown", message: AUTH_ERROR_MESSAGES.unknown };
};
