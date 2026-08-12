/**
 * Presentation helpers for the Seller Orders production worklist.
 *
 * Pure, environment-neutral, zero-runtime-import module: everything here
 * is verifiable with Node's built-in test runner (see orders-format.test.ts).
 *
 * Scope discipline (V1 production list):
 *   - The page answers exactly one question: "Bu siparişte ne basacağım?"
 *     Primary hierarchy: Telefon → Sipariş No → Baskı içeriği.
 *   - No invented states: "Henüz alınmadı" is a presentation fallback,
 *     never a new business state; COMPLETE stays the backend's
 *     "bilgiler toplandı" meaning only.
 *   - custom_text is production-critical: helpers measure emptiness on a
 *     trimmed view but ALWAYS hand the untouched stored value to the UI.
 */

import type { OrderSummary, OrderView } from "./orders";

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

export const normalizeOrderSearchParam = (
  value: string | string[] | undefined,
): string | null => {
  const single = Array.isArray(value) ? value[0] : value;
  if (typeof single !== "string") return null;
  const trimmed = single.trim().slice(0, ORDER_SEARCH_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
};

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
}): string => {
  const params = new URLSearchParams();
  if (input.view !== DEFAULT_ORDER_VIEW) {
    params.set("view", input.view);
  }
  if (input.query !== null) {
    params.set("q", input.query);
  }
  const qs = params.toString();
  return qs ? `/seller/orders?${qs}` : "/seller/orders";
};

/* ------------------------------------------------------------------ */
/* Primary identity lines                                              */
/* ------------------------------------------------------------------ */

/**
 * Sipariş No fallback while collection is in progress. The internal
 * order id is never used as a substitute.
 */
export const ORDER_NUMBER_PENDING_LABEL = "Henüz alınmadı";

export const getOrderNumberDisplay = (
  order: Pick<OrderSummary, "externalOrderNumber">,
): { text: string; isPending: boolean } => {
  const number = order.externalOrderNumber;
  if (typeof number === "string" && number.trim().length > 0) {
    return { text: number, isPending: false };
  }
  return { text: ORDER_NUMBER_PENDING_LABEL, isPending: true };
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

/* ------------------------------------------------------------------ */
/* Baskı içeriği — the V1 core presentation concept                    */
/* ------------------------------------------------------------------ */

/** Fallback when neither image nor text is collected yet. */
export const PRINT_CONTENT_PENDING_LABEL = "Henüz alınmadı";

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
/* Empty-state copy (context-aware, compact)                           */
/* ------------------------------------------------------------------ */

export const orderListEmptyCopy = (
  view: OrderView,
  hasSearch: boolean,
): { title: string; description: string | null } => {
  if (hasSearch) {
    return {
      title: "Bu sipariş numarasıyla eşleşen kayıt bulunamadı.",
      description: null,
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
