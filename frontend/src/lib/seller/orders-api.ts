/**
 * Seller Orders — authenticated fetchers.
 *
 * Environment-neutral: every function takes an already-resolved access
 * token (server cookie session on first render, browser session for
 * incremental loads). Contract parsing lives in `orders.ts`.
 *
 *   - `GET /seller/orders`                         (list)
 *   - `GET /seller/orders/{order_id}`              (selected detail)
 *   - `GET /seller/messages/{message_id}/media`    (media proxy, blob)
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
  parseOrderDetailResponse,
  parseOrdersListResponse,
  type OrderDetail,
  type OrderListPage,
  type OrderView,
} from "@/lib/seller/orders";

export type FetchOrderListOptions = {
  view: OrderView;
  /** Exact marketplace order-number filter (backend equality match). */
  externalOrderNumber?: string | null;
  /** Backend `product_id` filter (real product id; ge=1). */
  productId?: number | null;
  /** 1..100; when omitted the backend default (20) applies. */
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
  cache?: RequestCache;
};

/** Fetch and parse `GET /seller/orders`. */
export const fetchOrderList = async (
  accessToken: string,
  options: FetchOrderListOptions,
): Promise<OrderListPage> => {
  const query = new URLSearchParams();
  query.set("view", options.view);
  if (
    typeof options.externalOrderNumber === "string" &&
    options.externalOrderNumber.length > 0
  ) {
    query.set("external_order_number", options.externalOrderNumber);
  }
  if (
    typeof options.productId === "number" &&
    Number.isInteger(options.productId) &&
    options.productId > 0
  ) {
    query.set("product_id", String(options.productId));
  }
  if (typeof options?.limit === "number") {
    query.set("limit", String(options.limit));
  }
  if (typeof options?.offset === "number") {
    query.set("offset", String(options.offset));
  }
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/orders?${query.toString()}`,
    accessToken,
    { signal: options.signal, cache: options.cache ?? "no-store" },
  );
  return parseOrdersListResponse(raw);
};

export type FetchOrderDetailOptions = {
  signal?: AbortSignal;
  cache?: RequestCache;
};

/**
 * Fetch and parse `GET /seller/orders/{order_id}` — the selected
 * order's snapshot detail (order block + dynamic-field snapshots with
 * their collected values). Called for ONE selected order at a time;
 * never in a per-row loop.
 */
export const fetchOrderDetail = async (
  accessToken: string,
  orderId: number,
  options?: FetchOrderDetailOptions,
): Promise<OrderDetail> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/orders/${orderId}`,
    accessToken,
    { signal: options?.signal, cache: options?.cache ?? "no-store" },
  );
  return parseOrderDetailResponse(raw);
};

export type FetchOrderImageOptions = {
  signal?: AbortSignal;
};

/**
 * Fetch one order image through the backend media proxy. Fails closed
 * with a typed ApiError whose message is the backend's own calm text;
 * callers must never render raw error internals.
 */
export const fetchOrderImageMedia = async (
  accessToken: string,
  messageId: number,
  options?: FetchOrderImageOptions,
): Promise<ApiBlobPayload> => {
  return apiFetchBlobWithAccessToken(
    `/seller/messages/${messageId}/media`,
    accessToken,
    { signal: options?.signal, cache: "no-store" },
  );
};
