/**
 * Public seller application — API transport.
 *
 * Kept separate from `seller-application.ts` (pure validation/normalization)
 * because the transport depends on the `@/lib/api` client, which the
 * Node test runner cannot resolve. This mirrors the existing
 * `feedback.ts` / `feedback-api.ts` split.
 */

import { apiFetch } from "@/lib/api/client";

import {
  buildSellerApplicationPayload,
  parseSellerApplicationResponse,
  type SellerApplicationInput,
  type SellerApplicationResult,
} from "./seller-application.ts";

/**
 * Submit a public seller application. Uses the shared `apiFetch` client
 * (which builds the URL from `NEXT_PUBLIC_API_BASE_URL` and normalizes
 * errors into `ApiError`); no credentials are ever sent.
 */
export const submitSellerApplication = async (
  input: SellerApplicationInput,
  options?: { signal?: AbortSignal },
): Promise<SellerApplicationResult> => {
  const raw = await apiFetch<unknown>("/applications", {
    method: "POST",
    body: JSON.stringify(buildSellerApplicationPayload(input)),
    signal: options?.signal,
  });
  return parseSellerApplicationResponse(raw);
};
