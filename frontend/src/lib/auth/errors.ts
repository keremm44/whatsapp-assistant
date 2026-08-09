/**
 * Auth error categories.
 *
 * The login surface never shows raw Supabase messages or raw FastAPI
 * error bodies. Instead, the auth flow classifies failures into a small
 * set of categories the UI can render with calm, consistent copy.
 *
 *   - invalid_credentials: Supabase rejected the email/password pair.
 *   - access_rejected:    Supabase login succeeded but the backend
 *                          refused the application access (no profile,
 *                          inactive profile, or invalid role).
 *   - network:            Request could not reach the backend, or the
 *                          backend response could not be parsed.
 *   - unknown:            Anything else.
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

const SUPABASE_INVALID_GRANT_CODES = new Set([
  "invalid_grant",
  "invalid_credentials",
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
  const status =
    typeof error === "object" && error !== null
      ? (error as { status?: unknown }).status
      : undefined;
  if (
    typeof code === "string" &&
    SUPABASE_INVALID_GRANT_CODES.has(code)
  ) {
    return {
      category: "invalid_credentials",
      message: AUTH_ERROR_MESSAGES.invalid_credentials,
    };
  }
  if (typeof status === "number" && status >= 400 && status < 500) {
    return {
      category: "invalid_credentials",
      message: AUTH_ERROR_MESSAGES.invalid_credentials,
    };
  }
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
