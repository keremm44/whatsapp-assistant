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
 *   - `GET /seller/orders/{id}` (`get_order_with_fields` +
 *     `database.get_order_detail`) backs the selected-order detail
 *     surface. It is fetched for ONE selected order at a time — never
 *     per list row (no N+1).
 *   - Detail `fields[]` are the order's dynamic-field SNAPSHOTS with
 *     their collected values (`order_field_snapshots` +
 *     `order_field_values`). Values are backend-normalized per
 *     field_type (migration 014 CHECK) and parsed strictly here;
 *     image values carry only the safe `{"message_id": n}` reference.
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

/**
 * Migration 014 `order_field_definitions_type_check` — the only
 * dynamic field types the backend can store (snapshots mirror the
 * same CHECK via `field_type_snapshot`).
 */
export const ORDER_FIELD_TYPES = [
  "short_text",
  "long_text",
  "number",
  "single_choice",
  "multi_choice",
  "boolean",
  "image",
] as const;
export type OrderFieldType = (typeof ORDER_FIELD_TYPES)[number];

const isOrderFieldType = (value: unknown): value is OrderFieldType =>
  typeof value === "string" &&
  (ORDER_FIELD_TYPES as readonly string[]).includes(value);

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
   * Stored product-name snapshot; rendered as the row's product line
   * when present (never replaced by the internal productId).
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
  /**
   * Returned-page length (`toplam`) — never a global total.
   * `database.list_orders` computes it as `len(result.data)` of the
   * paginated range. Pagination must never treat this as a count.
   */
  pageCount: number;
  limit: number;
  offset: number;
  orders: OrderSummary[];
};

/* ------------------------------------------------------------------ */
/* Detail contract (GET /seller/orders/{id})                           */
/* ------------------------------------------------------------------ */

/**
 * The detail's order block (`seller_order_detail` in
 * protected_routes.py). Superset of the summary: adds the verbatim
 * customer note and the closed timestamp. The backend now exposes the
 * same `seller_action_required` boolean as the list, so detail
 * presentation never has to recreate the review rule from `status`.
 * Internal message references (`created_from_message_id`,
 * `last_source_message_id`) are not parsed — they are not user-facing.
 */
export type OrderDetailRecord = {
  id: number;
  externalOrderNumber: string | null;
  productId: number | null;
  productNameSnapshot: string | null;
  customerId: number;
  customerPhoneSnapshot: string | null;
  /** Customer's own free-text note; rendered verbatim, never rewritten. */
  customerNote: string | null;
  imageMessageId: number | null;
  /** Exact production text; null while not collected / not required. */
  customText: string | null;
  status: OrderStatus;
  /** Backend-authoritative Turkish label; rendered verbatim. */
  displayStatus: string;
  reviewReasonCode: string | null;
  reviewReasonNote: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  closedAt: string | null;
  sellerActionRequired: boolean;
};

/** One `{value, label}` entry of a choice field's options snapshot. */
export type OrderFieldOption = {
  value: string;
  label: string | null;
};

/**
 * A collected dynamic-field value, discriminated by the snapshot's
 * field_type. Shapes mirror the backend's own write-time
 * normalization in `order_service._validate_field_value`:
 *   short_text/long_text → string
 *   number               → finite number (int or float)
 *   single_choice        → canonical option value (string)
 *   multi_choice         → non-empty list of canonical option values
 *   boolean              → boolean
 *   image                → safe `{message_id}` media-proxy reference
 */
export type OrderFieldValue =
  | { kind: "text"; text: string }
  | { kind: "number"; value: number }
  | { kind: "single_choice"; value: string }
  | { kind: "multi_choice"; values: string[] }
  | { kind: "boolean"; value: boolean }
  | { kind: "image"; messageId: number };

/**
 * One entry of the detail's `fields[]` — a dynamic-field snapshot
 * plus its collected value. `completed === false` means the value
 * has not been collected yet (`value` is null); the backend pairs
 * `completed` with the presence of a value row.
 */
export type OrderDetailField = {
  id: number;
  fieldKey: string;
  /** Seller-defined label snapshot; the production line's left side. */
  label: string;
  fieldType: OrderFieldType;
  isRequired: boolean;
  sortOrder: number;
  options: OrderFieldOption[];
  value: OrderFieldValue | null;
  completed: boolean;
};

export type OrderDetail = {
  order: OrderDetailRecord;
  fields: OrderDetailField[];
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
    // Shape-only validation: the value is the returned page length
    // (database.py: toplam = len(result.data)), never a global total.
    pageCount: readRequiredNonNegativeInteger(raw, "toplam"),
    limit: limitRaw,
    offset: readRequiredNonNegativeInteger(raw, "offset"),
    orders: ordersRaw.map(parseOrderSummary),
  };
};

const parseOrderDetailRecord = (raw: unknown): OrderDetailRecord => {
  if (!isPlainObject(raw)) throw contractError("detail_order");

  const statusRaw = readRequiredString(raw, "status");
  if (!(ORDER_STATUSES as readonly string[]).includes(statusRaw)) {
    throw contractError("status");
  }

  return {
    id: readRequiredPositiveInteger(raw, "id"),
    externalOrderNumber: readNullableString(raw, "external_order_number"),
    productId: readNullablePositiveInteger(raw, "product_id"),
    productNameSnapshot: readNullableString(raw, "product_name_snapshot"),
    customerId: readRequiredPositiveInteger(raw, "customer_id"),
    customerPhoneSnapshot: readNullableString(raw, "customer_phone_snapshot"),
    // Byte-exact customer text; presentation layers must not mutate it.
    customerNote: readNullableString(raw, "customer_note"),
    imageMessageId: readNullablePositiveInteger(raw, "image_message_id"),
    customText: readNullableString(raw, "custom_text"),
    status: statusRaw as OrderStatus,
    displayStatus: readRequiredString(raw, "display_status"),
    reviewReasonCode: readNullableString(raw, "review_reason_code"),
    reviewReasonNote: readNullableString(raw, "review_reason_note"),
    version: readRequiredPositiveInteger(raw, "version"),
    createdAt: readRequiredString(raw, "created_at"),
    updatedAt: readRequiredString(raw, "updated_at"),
    completedAt: readNullableString(raw, "completed_at"),
    closedAt: readNullableString(raw, "closed_at"),
    sellerActionRequired: readRequiredBoolean(raw, "seller_action_required"),
  };
};

/**
 * Options snapshot: a lenient allowlist projection. Entries without a
 * usable string `value` are skipped (the backend's own validators do
 * the same when matching answers); `label` is kept when it is a
 * non-empty string.
 */
const parseOrderFieldOptions = (raw: unknown): OrderFieldOption[] => {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) throw contractError("field_options");
  const options: OrderFieldOption[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const value = entry.value;
    if (typeof value !== "string" || value.trim().length === 0) continue;
    const label = entry.label;
    options.push({
      value,
      label:
        typeof label === "string" && label.trim().length > 0 ? label : null,
    });
  }
  return options;
};

/**
 * Parse one collected value against its snapshot field_type. Shapes
 * are guaranteed by the backend's write-time normalization
 * (`order_service._validate_field_value`); anything else is a
 * contract drift and fails closed.
 */
const parseOrderFieldValue = (
  fieldType: OrderFieldType,
  raw: unknown,
): OrderFieldValue => {
  switch (fieldType) {
    case "short_text":
    case "long_text": {
      if (typeof raw !== "string") throw contractError("field_value_text");
      return { kind: "text", text: raw };
    }
    case "number": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        throw contractError("field_value_number");
      }
      return { kind: "number", value: raw };
    }
    case "single_choice": {
      if (typeof raw !== "string") throw contractError("field_value_choice");
      return { kind: "single_choice", value: raw };
    }
    case "multi_choice": {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) {
        throw contractError("field_value_multi_choice");
      }
      return { kind: "multi_choice", values: raw as string[] };
    }
    case "boolean": {
      if (typeof raw !== "boolean") throw contractError("field_value_boolean");
      return { kind: "boolean", value: raw };
    }
    case "image": {
      if (!isPlainObject(raw)) throw contractError("field_value_image");
      const messageId = raw.message_id;
      if (
        typeof messageId !== "number" ||
        !Number.isInteger(messageId) ||
        messageId <= 0
      ) {
        throw contractError("field_value_image_message_id");
      }
      return { kind: "image", messageId };
    }
  }
};

const parseOrderDetailField = (raw: unknown): OrderDetailField => {
  if (!isPlainObject(raw)) throw contractError("field");

  const fieldTypeRaw = readKey(raw, "field_type");
  if (!isOrderFieldType(fieldTypeRaw)) throw contractError("field_type");

  const completed = readRequiredBoolean(raw, "completed");
  const valueRaw = readKey(raw, "value");

  // Backend invariant: `completed` mirrors the existence of a value
  // row (`value_row is not None` in database.get_order_detail), so a
  // completed field always carries a value payload.
  if (completed && (valueRaw === null || valueRaw === undefined)) {
    throw contractError("field_completed_without_value");
  }

  return {
    id: readRequiredPositiveInteger(raw, "id"),
    fieldKey: readRequiredString(raw, "field_key"),
    label: readRequiredString(raw, "label"),
    fieldType: fieldTypeRaw,
    isRequired: readRequiredBoolean(raw, "is_required"),
    sortOrder: readRequiredNonNegativeInteger(raw, "sort_order"),
    options: parseOrderFieldOptions(readKey(raw, "options")),
    value:
      valueRaw === null || valueRaw === undefined
        ? null
        : parseOrderFieldValue(fieldTypeRaw, valueRaw),
    completed,
  };
};

const parseOrderDetail = (raw: unknown): OrderDetail => {
  if (!isPlainObject(raw)) throw contractError("detail_response");
  const fieldsRaw = readKey(raw, "fields");
  if (!Array.isArray(fieldsRaw)) throw contractError("fields");
  return {
    order: parseOrderDetailRecord(readKey(raw, "order")),
    // Backend already orders by sort_order_snapshot; preserved verbatim.
    fields: fieldsRaw.map(parseOrderDetailField),
  };
};

/* ------------------------------------------------------------------ */
/* Parse entry points (used by orders-api.ts fetchers)                 */
/* ------------------------------------------------------------------ */

export const parseOrdersListResponse = (raw: unknown): OrderListPage =>
  parseOrderListPage(raw);

export const parseOrderDetailResponse = (raw: unknown): OrderDetail =>
  parseOrderDetail(raw);

export const ORDERS_CONTRACT_ERROR_PREFIX = ORDERS_CONTRACT_PREFIX;
