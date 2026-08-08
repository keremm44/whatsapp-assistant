/**
 * API client foundation.
 *
 * Responsibilities (this step):
 *  - Build URLs from NEXT_PUBLIC_API_BASE_URL.
 *  - Provide a single place where a Bearer access token will be attached
 *    in a later step (the auth foundation is prepared but not wired yet).
 *  - Normalize HTTP errors into a typed ApiError so callers can render
 *    calm, specific messages instead of generic toasts.
 *
 * No business-specific API modules (orders, returns, etc.) live here yet.
 * Those will be derived from the backend contract in later steps.
 */

import { env } from "@/config/env";

export type ApiErrorBody = {
  message?: string;
  detail?: unknown;
  code?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    if (typeof body === "object" && body !== null) {
      const maybeCode = (body as ApiErrorBody).code;
      if (typeof maybeCode === "string") {
        this.code = maybeCode;
      }
    }
  }
}

export type ApiFetchOptions = RequestInit & {
  /**
   * When "required" the client will attach the current Supabase access token
   * as a Bearer header. Wired in a later step; the default "off" keeps this
   * step safe before the auth foundation is fully connected.
   */
  auth?: "off" | "required";
  /**
   * Abort signal forwarded to fetch. Components can use AbortController to
   * cancel in-flight requests on unmount.
   */
  signal?: AbortSignal;
};

const buildUrl = (path: string): string => {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${env.apiBaseUrl}${normalizedPath}`;
};

const fallbackMessage = (status: number): string =>
  `İstek başarısız oldu (${status}).`;

/**
 * Derive a human-readable message from an already-parsed error body.
 * Supports FastAPI-style shapes:
 *   { message: "..." }
 *   { code: "...", message: "..." }
 *   { detail: "..." }            (string only — non-string detail falls back)
 *   { detail: { message: "..." } }  (FastAPI sometimes nests)
 */
const messageFromBody = (body: unknown, status: number): string => {
  const fallback = fallbackMessage(status);
  if (typeof body !== "object" || body === null) {
    return fallback;
  }

  const record = body as Record<string, unknown>;

  if (typeof record.message === "string" && record.message.length > 0) {
    return record.message;
  }

  if (typeof record.detail === "string" && record.detail.length > 0) {
    return record.detail;
  }

  if (
    typeof record.detail === "object" &&
    record.detail !== null &&
    typeof (record.detail as Record<string, unknown>).message === "string"
  ) {
    const nested = (record.detail as Record<string, unknown>).message;
    if (typeof nested === "string" && nested.length > 0) {
      return nested;
    }
  }

  return fallback;
};

/**
 * Low-level fetch wrapper. Use this from feature-specific API modules.
 *
 * The auth parameter is intentionally a no-op in this step; the actual
 * Supabase session lookup will be wired in once the auth foundation
 * (lib/supabase) is connected to the React tree.
 */
export async function apiFetch<TResponse = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<TResponse> {
  const { auth: _auth = "off", headers, signal, ...rest } = options;

  const requestInit: RequestInit = {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(rest.body !== undefined && !(rest.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...headers,
    },
  };

  if (signal) {
    requestInit.signal = signal;
  }

  const response = await fetch(buildUrl(path), requestInit);

  if (!response.ok) {
    // Parse the error body exactly once. A Response body can only be consumed
    // once; reading it twice would silently lose FastAPI's real message.
    const body: unknown = await response.json().catch(() => ({}));
    const message = messageFromBody(body, response.status);
    throw new ApiError(message, response.status, body);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}
