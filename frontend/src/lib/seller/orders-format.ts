/**
 * Presentation helpers for the Seller Orders production worklist.
 *
 * Pure, environment-neutral, zero-runtime-import module: everything here
 * is verifiable with Node's built-in test runner (see orders-format.test.ts).
 *
 * Scope discipline (V1 production list):
 *   - The page answers exactly one question: "Bu siparişte ne basacağım?"
 *     Primary hierarchy: Sipariş → Ürün → Baskı içeriği → Durum →
 *     Konuşma. The phone is secondary metadata, never the visual anchor.
 *   - No invented states: the empty/pending phrases are contextual
 *     presentation fallbacks, never new business states; COMPLETE
 *     stays the backend's "bilgiler toplandı" meaning only.
 *   - custom_text is production-critical: helpers measure emptiness on a
 *     trimmed view but ALWAYS hand the untouched stored value to the UI.
 */

import type {
  OrderDetailField,
  OrderStatus,
  OrderSummary,
  OrderView,
} from "./orders";

/* ------------------------------------------------------------------ */
/* View tabs (approved exact set)                                      */
/* ------------------------------------------------------------------ */

export type OrderViewTab = {
  view: OrderView;
  label: string;
};

/**
 * The only three V1 views. Backend `view` mapping:
 *   Tümü             → view=all
 *   Bilgi Toplanıyor → view=collecting
 *   İncelenecekler   → view=action_required
 * COMPLETE items remain inside "Tümü" — there is deliberately no
 * "Hazır"/"Tamamlanan" tab because backend COMPLETE is an information
 * state, not a fulfillment state.
 */
export const ORDER_VIEW_TABS: readonly OrderViewTab[] = [
  { view: "all", label: "Tümü" },
  { view: "collecting", label: "Bilgi Toplanıyor" },
  { view: "action_required", label: "İncelenecekler" },
];

/** Default tab when the URL carries no (or an unknown) view. */
export const DEFAULT_ORDER_VIEW: OrderView = "all";

/** Normalize the raw `view` search param to a backend view. */
export const normalizeOrderViewParam = (
  value: string | string[] | undefined,
): OrderView => {
  const single = Array.isArray(value) ? value[0] : value;
  if (single === "collecting" || single === "action_required") {
    return single;
  }
  return DEFAULT_ORDER_VIEW;
};

/* ------------------------------------------------------------------ */
/* Exact order-number search                                           */
/* ------------------------------------------------------------------ */

/**
 * Search maps 1:1 onto the backend's exact `external_order_number`
 * filter (Query max_length=100). Only surrounding whitespace is
 * normalized; there is no fuzzy matching anywhere on this surface.
 */
export const ORDER_SEARCH_MAX_LENGTH = 100;

/**
 * Neutral seller-facing search copy. The backend does not guarantee any
 * marketplace number format, so the placeholder never teaches one
 * (no fabricated "Örn. TR123456" example) and never implies fuzzy
 * matching — the semantics stay the exact external-order-number filter.
 */
export const ORDER_SEARCH_LABEL = "Sipariş numarası";
export const ORDER_SEARCH_PLACEHOLDER = "Sipariş numarasıyla ara";

export const normalizeOrderSearchParam = (
  value: string | string[] | undefined,
): string | null => {
  const single = Array.isArray(value) ? value[0] : value;
  if (typeof single !== "string") return null;
  const trimmed = single.trim().slice(0, ORDER_SEARCH_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
};

/* ------------------------------------------------------------------ */
/* Product filter (backend `product_id`)                               */
/* ------------------------------------------------------------------ */

export const ORDER_PRODUCT_FILTER_LABEL = "Ürün";
export const ORDER_PRODUCT_FILTER_ALL_LABEL = "Tüm ürünler";
/**
 * Shown as the active option when the URL carries a product filter but
 * the product list could not be loaded — keeps the filter clearable
 * without exposing a raw internal id.
 */
export const ORDER_PRODUCT_FILTER_ACTIVE_FALLBACK_LABEL = "Seçili ürün";

/** Normalize the raw `product` search param: a real positive id or nothing. */
export const normalizeOrderProductParam = (
  value: string | string[] | undefined,
): number | null => {
  const single = Array.isArray(value) ? value[0] : value;
  if (typeof single !== "string") return null;
  const trimmed = single.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const id = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/* ------------------------------------------------------------------ */
/* Selected order (detail surface)                                     */
/* ------------------------------------------------------------------ */

/**
 * Normalize the raw `order` search param: a positive integer id or no
 * selection. Zero, negatives, floats and junk behave as no selection.
 */
export const normalizeOrderSelectionParam = (
  value: string | string[] | undefined,
): number | null => {
  const single = Array.isArray(value) ? value[0] : value;
  if (typeof single !== "string") return null;
  const trimmed = single.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const id = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/**
 * Whether selecting `nextOrderId` should push a new history entry.
 * Re-clicking the already-selected row must NOT push: repeated
 * same-URL entries would make browser Back walk through duplicates
 * of the identical selection state.
 */
export const shouldPushOrderSelection = (
  currentSelectedId: number | null,
  nextOrderId: number,
): boolean => currentSelectedId !== nextOrderId;

/**
 * Build the orders list URL. `offset` never appears: pagination is a
 * transient client concern, so switching view or search starts from the
 * first page (offset reset) by construction.
 */
/* ------------------------------------------------------------------ */
/* Pagination (page-length rule — `toplam` is never a global total)    */
/* ------------------------------------------------------------------ */

/** Fixed V1 page size (backend default). */
export const ORDER_PAGE_SIZE = 20;

/**
 * The only “is there another page?” signal: whether the backend
 * returned a full page. A short page (or an empty one) means the end.
 * A full first page of 20 must NEVER be treated as “that is all”.
 */
export const hasAnotherOrdersPage = (
  lastPageSize: number,
  pageSize: number = ORDER_PAGE_SIZE,
): boolean => lastPageSize > 0 && lastPageSize >= pageSize;

/**
 * Merge a freshly loaded page, deduping by order id while preserving
 * the backend's ordering verbatim (rows that shifted between pages
 * are not duplicated).
 */
export const mergeOrdersPage = (
  existing: readonly OrderSummary[],
  incoming: readonly OrderSummary[],
): OrderSummary[] => {
  const seen = new Set(existing.map((row) => row.id));
  const fresh = incoming.filter((row) => !seen.has(row.id));
  return [...existing, ...fresh];
};

/**
 * Build the orders list URL. `offset` never appears: pagination is a
 * transient client concern, so switching view or search starts from the
 * first page (offset reset) by construction.
 */
export const ordersListHref = (input: {
  view: OrderView;
  query: string | null;
  /** Backend `product_id` filter; omitted when null/absent. */
  productId?: number | null;
  /**
   * Selected order id (detail surface). Filter navigations never pass
   * it, so any view/search/product change drops the selection by
   * construction — a selected order that may no longer match the new
   * filter can never linger in the URL.
   */
  orderId?: number | null;
}): string => {
  const params = new URLSearchParams();
  if (input.view !== DEFAULT_ORDER_VIEW) {
    params.set("view", input.view);
  }
  if (input.query !== null) {
    params.set("q", input.query);
  }
  if (
    typeof input.productId === "number" &&
    Number.isInteger(input.productId) &&
    input.productId > 0
  ) {
    params.set("product", String(input.productId));
  }
  if (
    typeof input.orderId === "number" &&
    Number.isInteger(input.orderId) &&
    input.orderId > 0
  ) {
    params.set("order", String(input.orderId));
  }
  const qs = params.toString();
  return qs ? `/seller/orders?${qs}` : "/seller/orders";
};

/* ------------------------------------------------------------------ */
/* Primary identity lines                                              */
/* ------------------------------------------------------------------ */

/**
 * Sipariş No fallback. Context-specific, single-phrase copy: the
 * waiting phrase appears only where it is semantically true (the
 * assistant is still COLLECTING); any other status with a missing
 * number renders a neutral dash. The internal order id is never used
 * as a substitute.
 */
export const ORDER_NUMBER_PENDING_LABEL = "Sipariş numarası bekleniyor";

export const getOrderNumberDisplay = (
  order: Pick<OrderSummary, "externalOrderNumber" | "status">,
): { text: string; isPending: boolean } => {
  const number = order.externalOrderNumber;
  if (typeof number === "string" && number.trim().length > 0) {
    return { text: number, isPending: false };
  }
  if (order.status === "COLLECTING") {
    return { text: ORDER_NUMBER_PENDING_LABEL, isPending: true };
  }
  return { text: "—", isPending: true };
};

/**
 * Telefon fallback. The stored snapshot value is rendered verbatim;
 * only a missing value falls back to a neutral dash.
 */
export const PHONE_FALLBACK_LABEL = "—";

export const getPhoneDisplay = (
  order: Pick<OrderSummary, "customerPhoneSnapshot">,
): string => {
  const phone = order.customerPhoneSnapshot;
  if (typeof phone === "string" && phone.trim().length > 0) {
    return phone;
  }
  return PHONE_FALLBACK_LABEL;
};

/**
 * Ürün — the stored `product_name_snapshot`, verbatim. Returns null
 * when absent/blank so the caller simply omits the line: there is no
 * "Ürün bilinmiyor" fabrication, and the internal productId is never
 * substituted as a seller-facing product identity.
 */
export const getProductNameDisplay = (
  order: Pick<OrderSummary, "productNameSnapshot">,
): string | null => {
  const name = order.productNameSnapshot;
  if (typeof name === "string" && name.trim().length > 0) {
    return name.trim();
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* Order → Conversation (approved cross-panel navigation)              */
/* ------------------------------------------------------------------ */

/** Visible label of the per-row conversation action. */
export const ORDER_OPEN_CONVERSATION_LABEL = "Konuşmayı aç";

/**
 * The canonical conversation route for the order's customer — the same
 * `/seller/conversations/{customerId}` shape that
 * conversations-format.conversationDetailHref produces without the
 * attention filter. Inlined here so this module keeps its
 * zero-alias-import discipline (Node's built-in test runner cannot
 * resolve the conversations alias import chain).
 *
 * A valid positive customer_id is required — no id, no link (no fake
 * identity, no invented fallback).
 */
export const getOrderConversationHref = (
  customerId: number | null | undefined,
): string | null =>
  typeof customerId === "number" &&
  Number.isInteger(customerId) &&
  customerId > 0
    ? `/seller/conversations/${customerId}`
    : null;

/* ------------------------------------------------------------------ */
/* Baskı içeriği — the V1 core presentation concept                    */
/* ------------------------------------------------------------------ */

/**
 * Fallback when neither image nor text is present. The waiting phrase
 * is used only while the backend is truthfully still collecting; for
 * any other status the absence renders as a neutral dash (the backend
 * does not claim more content is coming).
 */
export const PRINT_CONTENT_PENDING_LABEL = "Baskı bilgisi bekleniyor";

export const getPrintContentEmptyLabel = (status: OrderStatus): string =>
  status === "COLLECTING" ? PRINT_CONTENT_PENDING_LABEL : "—";

/** Accessible label of the image access action (never "open detail"). */
export const PRINT_IMAGE_ACTION_LABEL = "Görsel";

/**
 * The four — and only four — print-content presentations. Derived
 * exclusively from `hasImage` + `imageMessageId` + `customText`;
 * no backend business status is encoded here.
 */
export type PrintContentPresentation =
  | { kind: "image"; imageMessageId: number }
  | { kind: "text"; text: string }
  | { kind: "image_text"; imageMessageId: number; text: string }
  | { kind: "none" };

export const getPrintContent = (
  order: Pick<OrderSummary, "hasImage" | "imageMessageId" | "customText">,
): PrintContentPresentation => {
  // The image is actionable only when the media proxy can be addressed:
  // has_image=true and a positive message id (parser-enforced pairing).
  const hasActionableImage =
    order.hasImage === true &&
    typeof order.imageMessageId === "number" &&
    order.imageMessageId > 0;

  // Emptiness is measured on a trimmed view; the UI receives the exact
  // stored text so nothing production-critical is ever altered.
  const text =
    typeof order.customText === "string" && order.customText.trim().length > 0
      ? order.customText
      : null;

  if (hasActionableImage && text !== null) {
    return { kind: "image_text", imageMessageId: order.imageMessageId as number, text };
  }
  if (hasActionableImage) {
    return { kind: "image", imageMessageId: order.imageMessageId as number };
  }
  if (text !== null) {
    return { kind: "text", text };
  }
  return { kind: "none" };
};

/* ------------------------------------------------------------------ */
/* Seller-review context (restrained, backend-owned)                   */
/* ------------------------------------------------------------------ */

/**
 * Review note shown as secondary context when the backend flags the row
 * (`seller_action_required`). Returns null when absent/blank so the
 * caller renders nothing. The raw `review_reason_code` is intentionally
 * never surfaced (no verified frontend mapping exists).
 */
export const getReviewNoteDisplay = (
  order: Pick<OrderSummary, "reviewReasonNote">,
): string | null => {
  const note = order.reviewReasonNote;
  if (typeof note === "string" && note.trim().length > 0) {
    return note.trim();
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* Image preview state machine + loader (dependency-injected)          */
/* ------------------------------------------------------------------ */

/**
 * The preview dialog's data flow, kept pure so media success/failure is
 * testable without a DOM. Real wiring: `orders-api.fetchOrderImageMedia`
 * + `URL.createObjectURL`. On `error` the list itself is unaffected —
 * only the dialog shows calm feedback.
 */
export type OrderImagePreviewState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; objectUrl: string; contentType: string | null }
  | { phase: "error" };

export const orderImagePreviewInitial: OrderImagePreviewState = {
  phase: "idle",
};

export type OrderImagePreviewEvent =
  | { type: "open" }
  | { type: "loaded"; objectUrl: string; contentType: string | null }
  | { type: "failed" }
  | { type: "close" };

export const reduceOrderImagePreview = (
  _state: OrderImagePreviewState,
  event: OrderImagePreviewEvent,
): OrderImagePreviewState => {
  switch (event.type) {
    case "open":
      return { phase: "loading" };
    case "loaded":
      return {
        phase: "ready",
        objectUrl: event.objectUrl,
        contentType: event.contentType,
      };
    case "failed":
      return { phase: "error" };
    case "close":
      return { phase: "idle" };
  }
};

/**
 * Fetch + object-url resolution for one preview open. Any failure
 * (network, 4xx/5xx via ApiError, token loss) collapses to
 * `{ ok: false }` so the dialog can show calm feedback without leaking
 * provider URLs, host names or internal error codes.
 */
export const resolveOrderImagePreview = async (
  fetchMedia: () => Promise<{ blob: Blob; contentType: string | null }>,
  createObjectUrl: (blob: Blob) => string,
): Promise<
  | { ok: true; objectUrl: string; contentType: string | null }
  | { ok: false }
> => {
  try {
    const media = await fetchMedia();
    return {
      ok: true,
      objectUrl: createObjectUrl(media.blob),
      contentType: media.contentType,
    };
  } catch {
    return { ok: false };
  }
};

/* ------------------------------------------------------------------ */
/* Dynamic-field snapshot values (detail production lines)             */
/* ------------------------------------------------------------------ */

/** Boolean field value language (backend collects Evet/Hayır answers). */
export const ORDER_FIELD_BOOLEAN_TRUE_LABEL = "Evet";
export const ORDER_FIELD_BOOLEAN_FALSE_LABEL = "Hayır";
/** Single truthful waiting phrase for a not-yet-collected field value. */
export const ORDER_FIELD_PENDING_LABEL = "Bekleniyor";

/**
 * One production line's right side, derived ONLY from the snapshot
 * value the backend stored:
 *   text    → renderable string (choice values resolved to their
 *             option label when the snapshot carries one)
 *   image   → media-proxy reference for the existing preview dialog
 *   pending → not collected yet (`completed=false`); the caller shows
 *             the waiting phrase while the order is still COLLECTING
 *             and a neutral dash otherwise
 */
export type OrderFieldValueDisplay =
  | { kind: "text"; text: string }
  | { kind: "image"; messageId: number }
  | { kind: "pending" };

const resolveOptionLabel = (
  field: Pick<OrderDetailField, "options">,
  value: string,
): string => {
  const option = field.options.find((entry) => entry.value === value);
  if (option && typeof option.label === "string" && option.label.trim()) {
    return option.label;
  }
  return value;
};

export const getOrderFieldValueDisplay = (
  field: Pick<OrderDetailField, "value" | "options">,
): OrderFieldValueDisplay => {
  const value = field.value;
  if (value === null) return { kind: "pending" };
  switch (value.kind) {
    case "text":
      return { kind: "text", text: value.text };
    case "number":
      // Backend-normalized number; localized display, meaning unchanged.
      return { kind: "text", text: String(value.value) };
    case "single_choice":
      return { kind: "text", text: resolveOptionLabel(field, value.value) };
    case "multi_choice":
      return {
        kind: "text",
        text: value.values
          .map((entry) => resolveOptionLabel(field, entry))
          .join(", "),
      };
    case "boolean":
      return {
        kind: "text",
        text: value.value
          ? ORDER_FIELD_BOOLEAN_TRUE_LABEL
          : ORDER_FIELD_BOOLEAN_FALSE_LABEL,
      };
    case "image":
      return { kind: "image", messageId: value.messageId };
  }
};

/* ------------------------------------------------------------------ */
/* Detail surface copy (selection / loading / failure states)          */
/* ------------------------------------------------------------------ */

export const ORDER_DETAIL_EMPTY_GUIDANCE =
  "Detayları görmek için listeden bir sipariş seçin.";
export const ORDER_DETAIL_LOADING_LABEL = "Sipariş detayı yükleniyor";
/** Calm 404 — also covers a URL pointing at another tenant's record. */
export const ORDER_DETAIL_NOT_FOUND_TITLE = "Bu sipariş bulunamadı.";
export const ORDER_DETAIL_UNAVAILABLE_TITLE =
  "Sipariş detayı yüklenemedi.";
export const ORDER_DETAIL_UNAVAILABLE_DESCRIPTION =
  "Bağlantı kurulamadı. Liste bundan etkilenmez; tekrar deneyebilirsiniz.";

/** Detail sections (üretim yüzeyi başlıkları). */
export const ORDER_DETAIL_PRODUCTION_TITLE = "Üretim bilgileri";
export const ORDER_DETAIL_PRINT_TITLE = "Baskı içeriği";
export const ORDER_DETAIL_CUSTOMER_TITLE = "Müşteri";
export const ORDER_DETAIL_ORDER_TITLE = "Sipariş";
export const ORDER_DETAIL_TIMELINE_TITLE = "Zaman bilgileri";
export const ORDER_DETAIL_CUSTOMER_NOTE_LABEL = "Müşteri notu";

/**
 * Detail timestamp — a normal localized date-time. Factual instants
 * only; never converted into waiting-time claims. Returns null for
 * unparseable input so the caller omits the line.
 */
export const formatOrderTimestamp = (iso: string): string | null => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

/* ------------------------------------------------------------------ */
/* Empty-state copy (context-aware, compact)                           */
/* ------------------------------------------------------------------ */

/**
 * Filtered-empty is a different user situation than true-empty: the
 * copy must make clear the emptiness is the filter's result (the
 * toolbar keeps the clear controls visible).
 */
export const orderListEmptyCopy = (
  view: OrderView,
  filters: { search: boolean; product: boolean },
): { title: string; description: string | null } => {
  if (filters.search) {
    return {
      title: "Bu sipariş numarasıyla eşleşen kayıt bulunamadı.",
      description: null,
    };
  }
  if (filters.product) {
    return {
      title: "Bu ürün filtresiyle eşleşen sipariş bulunamadı.",
      description:
        "Filtreyi kaldırarak tüm siparişleri görebilirsiniz.",
    };
  }
  if (view === "collecting") {
    return {
      title: "Şu anda bilgisi toplanan sipariş yok.",
      description: null,
    };
  }
  if (view === "action_required") {
    return {
      title: "Şu anda incelemeniz gereken sipariş yok.",
      description: null,
    };
  }
  return {
    title: "Henüz sipariş bilgisi yok.",
    description:
      "Müşterilerden WhatsApp üzerinden toplanan sipariş ve baskı bilgileri burada listelenir.",
  };
};
