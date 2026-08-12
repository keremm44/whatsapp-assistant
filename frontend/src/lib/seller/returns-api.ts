/**
 * Seller “İade ve Sorunlar” — authenticated fetchers.
 *
 * Environment-neutral: every function takes an already-resolved access
 * token (server cookie session on first render, browser session for
 * incremental loads and mutations). Contract parsing lives in
 * `returns.ts`.
 *
 *   - GET  /seller/return-issue-requests                      (list)
 *   - GET  /seller/return-issue-requests/{id}                 (detail)
 *   - POST /seller/return-issue-requests/{id}/actions         (mark_handled)
 *   - GET  /seller/return-issue-settings                      (settings)
 *   - PATCH /seller/return-issue-settings/{issue_type}        (one row)
 *   - GET  /seller/messages/{message_id}/media                (media proxy)
 *
 * The media endpoint returns binary image content through the backend's
 * authenticated, tenant-scoped SSRF-guarded proxy. The raw provider URL
 * is never visible to the frontend; only the fetched bytes are.
 */

import {
  apiFetchBlobWithAccessToken,
  apiFetchWithAccessToken,
} from "@/lib/api/authenticated";
import type { ApiBlobPayload } from "@/lib/api/client";
import {
  parseMarkReturnHandledResponse,
  parseReturnDetailResponse,
  parseReturnIssueSettingsList,
  parseReturnIssueSettingUpdate,
  parseReturnListResponse,
  type MarkReturnHandledResult,
  type ReturnIssueSetting,
  type ReturnIssueType,
  type ReturnListPage,
  type ReturnRequestDetail,
  type ReturnView,
} from "@/lib/seller/returns";

export type FetchReturnListOptions = {
  view: ReturnView;
  /** Exact external order-number filter (backend equality match). */
  externalOrderNumber?: string | null;
  /** Canonical issue_type filter (never the display label). */
  issueType?: ReturnIssueType | null;
  /** 1..100; when omitted the backend default (20) applies. */
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
  cache?: RequestCache;
};

/** Fetch and parse `GET /seller/return-issue-requests`. */
export const fetchReturnList = async (
  accessToken: string,
  options: FetchReturnListOptions,
): Promise<ReturnListPage> => {
  const query = new URLSearchParams();
  query.set("view", options.view);
  if (
    typeof options.externalOrderNumber === "string" &&
    options.externalOrderNumber.length > 0
  ) {
    query.set("external_order_number", options.externalOrderNumber);
  }
  if (typeof options.issueType === "string" && options.issueType.length > 0) {
    query.set("issue_type", options.issueType);
  }
  if (typeof options.limit === "number") {
    query.set("limit", String(options.limit));
  }
  if (typeof options.offset === "number") {
    query.set("offset", String(options.offset));
  }
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/return-issue-requests?${query.toString()}`,
    accessToken,
    { signal: options.signal, cache: options.cache ?? "no-store" },
  );
  return parseReturnListResponse(raw);
};

export type FetchReturnDetailOptions = {
  signal?: AbortSignal;
  cache?: RequestCache;
};

/** Fetch and parse `GET /seller/return-issue-requests/{request_id}`. */
export const fetchReturnDetail = async (
  accessToken: string,
  requestId: number,
  options?: FetchReturnDetailOptions,
): Promise<ReturnRequestDetail> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/return-issue-requests/${requestId}`,
    accessToken,
    { signal: options?.signal, cache: options?.cache ?? "no-store" },
  );
  return parseReturnDetailResponse(raw);
};

export type MarkReturnHandledOptions = {
  signal?: AbortSignal;
};

/**
 * POST the single approved seller action. `expected_version` is the
 * version the seller was looking at (optimistic concurrency; a stale
 * version answers HTTP 409). Throws ApiError on failure — the caller
 * classifies with `classifyReturnMutationFailure`.
 */
export const postMarkReturnHandled = async (
  accessToken: string,
  requestId: number,
  payload: { expected_version: number; note?: string },
  options?: MarkReturnHandledOptions,
): Promise<MarkReturnHandledResult> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/return-issue-requests/${requestId}/actions`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        action: "mark_handled",
        expected_version: payload.expected_version,
        ...(typeof payload.note === "string" && payload.note.length > 0
          ? { note: payload.note }
          : {}),
      }),
      signal: options?.signal,
      cache: "no-store",
    },
  );
  return parseMarkReturnHandledResponse(raw);
};

export type FetchReturnIssueSettingsOptions = {
  signal?: AbortSignal;
};

/** Fetch and parse `GET /seller/return-issue-settings` (all six rows). */
export const fetchReturnIssueSettings = async (
  accessToken: string,
  options?: FetchReturnIssueSettingsOptions,
): Promise<ReturnIssueSetting[]> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    "/seller/return-issue-settings",
    accessToken,
    { signal: options?.signal, cache: "no-store" },
  );
  return parseReturnIssueSettingsList(raw);
};

export type UpdateReturnIssueSettingOptions = {
  signal?: AbortSignal;
};

/**
 * PATCH one issue-type row. `expected_version` comes from the setting
 * the seller is looking at; the returned setting/version becomes the
 * new source of truth on success. HTTP 409 signals an elsewhere change.
 */
export const updateReturnIssueSetting = async (
  accessToken: string,
  issueType: ReturnIssueType,
  payload: { expected_version: number; image_requirement: string },
  options?: UpdateReturnIssueSettingOptions,
): Promise<{ changed: boolean; setting: ReturnIssueSetting }> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/return-issue-settings/${encodeURIComponent(issueType)}`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
      signal: options?.signal,
      cache: "no-store",
    },
  );
  return parseReturnIssueSettingUpdate(raw);
};

export type FetchReturnEvidenceMediaOptions = {
  signal?: AbortSignal;
};

/**
 * Fetch one evidence image through the backend media proxy. Fails
 * closed with a typed ApiError whose message is the backend's own calm
 * text; callers must never render raw error internals.
 */
export const fetchReturnEvidenceMedia = async (
  accessToken: string,
  messageId: number,
  options?: FetchReturnEvidenceMediaOptions,
): Promise<ApiBlobPayload> => {
  return apiFetchBlobWithAccessToken(
    `/seller/messages/${messageId}/media`,
    accessToken,
    { signal: options?.signal, cache: "no-store" },
  );
};
