/**
 * Authenticated API wrapper.
 *
 * Adds an `Authorization: Bearer <accessToken>` header to a request and
 * delegates to the environment-neutral `apiFetch`. This wrapper is the
 * single place where a Supabase access token becomes an authenticated
 * request to the FastAPI backend.
 *
 * The low-level `apiFetch` is intentionally NOT wired to a Supabase
 * client directly so it can be reused from server components and route
 * handlers in later steps. The caller is responsible for obtaining the
 * access token from the appropriate session source.
 *
 * No business-specific API modules live here. Those are derived from the
 * backend contract in later steps.
 */

import { apiFetch, type ApiFetchOptions } from "./client";

export async function apiFetchWithAccessToken<TResponse = unknown>(
  path: string,
  accessToken: string,
  options: Omit<ApiFetchOptions, "auth"> = {},
): Promise<TResponse> {
  return apiFetch<TResponse>(path, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
