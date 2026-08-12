/**
 * Seller “Cevaplanamayan Sorular” — authenticated fetchers.
 *
 * Environment-neutral: every function takes an already-resolved access
 * token (server cookie session on first render, browser session for
 * incremental loads and mutations). Contract parsing lives in
 * `unanswered.ts`.
 *
 *   - GET  /seller/unanswered-questions                     (list)
 *   - GET  /seller/unanswered-questions/{group_id}          (detail)
 *   - POST /seller/unanswered-questions/{group_id}/actions  (set_answer
 *     | dismiss — the only actions)
 *
 * No search/filter parameters exist on the list endpoint in V1 and
 * none are invented here.
 */

import { apiFetchWithAccessToken } from "@/lib/api/authenticated";
import {
  parseUnansweredActionResponse,
  parseUnansweredDetailResponse,
  parseUnansweredListResponse,
  type UnansweredActionResult,
  type UnansweredListPage,
  type UnansweredQuestionDetail,
  type UnansweredView,
} from "@/lib/seller/unanswered";

export type FetchUnansweredListOptions = {
  view: UnansweredView;
  /** 1..100; when omitted the backend default (20) applies. */
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
  cache?: RequestCache;
};

/** Fetch and parse `GET /seller/unanswered-questions`. */
export const fetchUnansweredList = async (
  accessToken: string,
  options: FetchUnansweredListOptions,
): Promise<UnansweredListPage> => {
  const query = new URLSearchParams();
  // The seller product view always asks explicitly; the backend
  // default is `all`, which is not the queue we open on.
  query.set("view", options.view);
  if (typeof options.limit === "number") {
    query.set("limit", String(options.limit));
  }
  if (typeof options.offset === "number") {
    query.set("offset", String(options.offset));
  }
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/unanswered-questions?${query.toString()}`,
    accessToken,
    { signal: options.signal, cache: options.cache ?? "no-store" },
  );
  return parseUnansweredListResponse(raw);
};

export type FetchUnansweredDetailOptions = {
  signal?: AbortSignal;
  cache?: RequestCache;
};

/** Fetch and parse `GET /seller/unanswered-questions/{group_id}`. */
export const fetchUnansweredDetail = async (
  accessToken: string,
  groupId: number,
  options?: FetchUnansweredDetailOptions,
): Promise<UnansweredQuestionDetail> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/unanswered-questions/${groupId}`,
    accessToken,
    { signal: options?.signal, cache: options?.cache ?? "no-store" },
  );
  return parseUnansweredDetailResponse(raw);
};

export type UnansweredActionRequest =
  | { action: "set_answer"; expected_version: number; answer: string }
  | { action: "dismiss"; expected_version: number; note?: string };

export type PostUnansweredActionOptions = {
  signal?: AbortSignal;
};

/**
 * POST one of the two approved seller actions. `expected_version` is
 * the version the seller was looking at (optimistic concurrency; a
 * stale or inapplicable transition answers HTTP 409, a contract
 * violation HTTP 422). Throws ApiError on failure — the caller
 * classifies with `classifyUnansweredMutationFailure`.
 */
export const postUnansweredAction = async (
  accessToken: string,
  groupId: number,
  payload: UnansweredActionRequest,
  options?: PostUnansweredActionOptions,
): Promise<UnansweredActionResult> => {
  const body: Record<string, unknown> = {
    action: payload.action,
    expected_version: payload.expected_version,
  };
  if (payload.action === "set_answer") {
    // set_answer: answer only. A note key must never appear here.
    body.answer = payload.answer;
  } else if (typeof payload.note === "string" && payload.note.length > 0) {
    // dismiss: optional note only. An answer key must never appear here.
    body.note = payload.note;
  }
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/unanswered-questions/${groupId}/actions`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(body),
      signal: options?.signal,
      cache: "no-store",
    },
  );
  return parseUnansweredActionResponse(raw);
};
