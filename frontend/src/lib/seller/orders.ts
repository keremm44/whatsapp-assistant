/**
 * Seller Orders — backend-derived contract layer.
 *
 * Contract module for the V1 production / print-content worklist at
 * /seller/orders. The backend endpoint `GET /seller/orders`
 * (`protected_routes.seller_orders` + `order_service.list_seller_orders`
 * + `_present_order_summary`) is the single source of truth; the
 * frontend never reads the `orders` table directly and never invents
 * business state around it.
 *
 * This module is deliberately dependency-free (types + parsers only,
 * zero runtime imports) so the contract can be verified with Node's
 * built-in test runner without a frontend test framework. Fetchers
 * live in `orders-api.ts`; presentation helpers in `orders-format.ts`.
 *
 * Proven facts enforced by the parsers (each claim documented at the
 * parse site):
 *
 *   - `view` is echoed from the request and belongs to the backend's
 *     Query pattern: exactly "all" | "collecting" | "action_required".
 *   - `status` is exactly one of migration 014's CHECK values
 *     (COLLECTING / COMPLETE / SELLER_REVIEW_REQUIRED). COMPLETE means
 *     "required order information collected" — never manufactured,
 *     fulfilled, shipped or seller-approved.
 *   - `display_status` is the backend's authoritative Turkish label
 *     (`ORDER_DISPLAY_STATUS` in database.py, with the backend's own
 *     "Bilinmiyor" fallback). The frontend renders it verbatim and
 *     keeps no separate status copy mapping.
 *   - `has_image` is derived in the backend as
 *     `image_message_id is not None` — enforced here as a cross-field
 *     invariant.
 *   - `custom_text` is raw production text (VARCHAR(1000), nullable).
 *     The parser preserves it byte-exact; presentation code must never
 *     trim/case-fold/paraphrase the stored value itself.
 *   - List ordering is the backend's own order; the frontend preserves
 *     it verbatim and never re-sorts.
 *   - `GET /seller/orders/{id}` detail is out of scope for this V1
 *     surface (no per-row detail fetches, no N+1).
 */

/* ------------------------------------------------------------------ */
/* Parse primitives (local, self-contained like conversations.ts)      */
/* ------------------------------------------------------------------ */

/** Parser-level error prefix; resolvers map it to `unavailable`. */
const ORDERS_CONTRACT_PREFIX = "orders_invalid_";

const contractError = (field: string): Error =>
  new Error(`${ORDERS_CONTRACT_PREFIX}${field}`);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readKey = (raw: Record<string, unknown>, key: string): unknown =>
  raw[key];

const readRequiredPositiveInteger = (
  raw: Record<string, unknown>,
  key: string,
): number => {
  const value = readKey(raw, key);
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw contractError(key);
  }
  return value;
};

const readRequiredNonNegativeInteger = (
  raw: Record<string, unknown>,
  key: string,
): number => {
  const value = readKey(raw, key);
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw contractError(key);
  }
  return value;
};

const readRequiredString = (
  raw: Record<string, unknown>,
  key: string,
): string => {
  const value = readKey(raw, key);
  if (typeof value !== "string") {
    throw contractError(key);
  }
  return value;
};

const readNullableString = (
  raw: Record<string, unknown>,
  key: string,
): string | null => {
  const value = readKey(raw, key);
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw contractError(key);
  }
  return value;
};

const readNullablePositiveInteger = (
  raw: Record<string, unknown>,
  key: string,
): number | null => {
  const value = readKey(raw, key);
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw contractError(key);
  }
  return value;
};

const readRequiredBoolean = (
  raw: Record<string, unknown>,
  key: string,
): boolean => {
  const value = readKey(raw, key);
  if (typeof value !== "boolean") {
    throw contractError(key);
  }
  return value;
};

/* ------------------------------------------------------------------ */
/* Allowlisted enums (backend-owned)                                   */
/* ------------------------------------------------------------------ */

/**
 * `view` Query pattern in protected_routes.seller_orders.
 * "all" | "collecting" | "action_required".
 */
export const ORDER_VIEWS = ["all", "collecting", "action_required"] as const;
export type OrderView = (typeof ORDER_VIEWS)[number];

const isOrderView = (value: unknown): value is OrderView =>
  typeof value === "string" &&
  (ORDER_VIEWS as readonly string[]).includes(value);

/**
 * Migration 014 orders_status CHECK. COMPLETE means "gerekli sipariş
 * bilgileri toplandı" — never a production/shipping state.
 */
export const ORDER_STATUSES = [
  "COLLECTING",
  "COMPLETE",
  "SELLER_REVIEW_REQUIRED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Typed contract (camelCase)                                          */
/* ------------------------------------------------------------------ */

/**
 * One row of `_present_order_summary`. Identity for this page is the
 * marketplace order number + customer phone snapshot; the internal
 * `id` is a stable React key / future-detail reference only, never a
 * user-facing order number.
 */
export type OrderSummary = {
  id: number;
  /** Marketplace order number; null while collection is in progress. */
  externalOrderNumber: string | null;
  productId: number | null;
  /**
   * Parsed for forward flexibility (product context may arrive later);
   * the V1 surface intentionally does not display it as a column.
   */
  productNameSnapshot: string | null;
  customerId: number;
  customerPhoneSnapshot: string | null;
  status: OrderStatus;
  /** Backend-authoritative Turkish label; rendered verbatim. */
  displayStatus: string;
  /** Internal message reference for the media proxy — never a URL. */
  imageMessageId: number | null;
  hasImage: boolean;
  /** Exact production text; null while not collected / not required. */
  customText: string | null;
  reviewReasonCode: string | null;
  reviewReasonNote: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  sellerActionRequired: boolean;
};

export type OrderListPage = {
  view: OrderView;
  /** Total filtered count (`toplam`), backend-owned key. */
  total: number;
  limit: number;
  offset: number;
  orders: OrderSummary[];
};

/* ------------------------------------------------------------------ */
/* Parsers                                                             */
/* ------------------------------------------------------------------ */

const parseOrderSummary = (raw: unknown): OrderSummary => {
  if (!isPlainObject(raw)) throw contractError("order");

  const statusRaw = readRequiredString(raw, "status");
  if (!(ORDER_STATUSES as readonly string[]).includes(statusRaw)) {
    throw contractError("status");
  }
  const imageMessageId = readNullablePositiveInteger(raw, "image_message_id");
  const hasImage = readRequiredBoolean(raw, "has_image");
  // Backend derives has_image as `image_message_id is not None`
  // (_present_order_summary) — cross-field invariant.
  if (hasImage !== (imageMessageId !== null)) {
    throw contractError("has_image_mismatch");
  }

  return {
    id: readRequiredPositiveInteger(raw, "id"),
    externalOrderNumber: readNullableString(raw, "external_order_number"),
    productId: readNullablePositiveInteger(raw, "product_id"),
    productNameSnapshot: readNullableString(raw, "product_name_snapshot"),
    customerId: readRequiredPositiveInteger(raw, "customer_id"),
    customerPhoneSnapshot: readNullableString(raw, "customer_phone_snapshot"),
    status: statusRaw as OrderStatus,
    displayStatus: readRequiredString(raw, "display_status"),
    imageMessageId,
    hasImage,
    // Byte-exact production text; presentation layers must not mutate it.
    customText: readNullableString(raw, "custom_text"),
    reviewReasonCode: readNullableString(raw, "review_reason_code"),
    reviewReasonNote: readNullableString(raw, "review_reason_note"),
    version: readRequiredPositiveInteger(raw, "version"),
    createdAt: readRequiredString(raw, "created_at"),
    updatedAt: readRequiredString(raw, "updated_at"),
    completedAt: readNullableString(raw, "completed_at"),
    sellerActionRequired: readRequiredBoolean(raw, "seller_action_required"),
  };
};

const parseOrderListPage = (raw: unknown): OrderListPage => {
  if (!isPlainObject(raw)) throw contractError("response");
  const viewRaw = readKey(raw, "view");
  if (!isOrderView(viewRaw)) throw contractError("view");
  const limitRaw = readKey(raw, "limit");
  if (
    typeof limitRaw !== "number" ||
    !Number.isInteger(limitRaw) ||
    limitRaw < 1 ||
    limitRaw > 100
  ) {
    throw contractError("limit_shape");
  }
  const ordersRaw = readKey(raw, "orders");
  if (!Array.isArray(ordersRaw)) throw contractError("orders");
  return {
    view: viewRaw,
    total: readRequiredNonNegativeInteger(raw, "toplam"),
    limit: limitRaw,
    offset: readRequiredNonNegativeInteger(raw, "offset"),
    orders: ordersRaw.map(parseOrderSummary),
  };
};

/* ------------------------------------------------------------------ */
/* Parse entry points (used by orders-api.ts fetchers)                 */
/* ------------------------------------------------------------------ */

export const parseOrdersListResponse = (raw: unknown): OrderListPage =>
  parseOrderListPage(raw);

export const ORDERS_CONTRACT_ERROR_PREFIX = ORDERS_CONTRACT_PREFIX;
