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

const extractErrorMessage = async (response: Response): Promise<string> => {
  const fallback = `İstek başarısız oldu (${response.status}).`;
  try {
    const data = (await response.json()) as ApiErrorBody;
    if (typeof data.message === "string" && data.message.length > 0) {
      return data.message;
    }
    if (typeof data.detail === "string" && data.detail.length > 0) {
      return data.detail;
    }
    return fallback;
  } catch {
    return fallback;
  }
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
    const body: unknown = await response
      .json()
      .catch(() => ({}));
    const message = await extractErrorMessage(response);
    throw new ApiError(message, response.status, body);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}
