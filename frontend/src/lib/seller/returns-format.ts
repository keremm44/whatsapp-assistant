/**
 * Presentation helpers for the Seller “İade ve Sorunlar” workspace.
 *
 * Pure, environment-neutral module (the only runtime import is the
 * pure `ordersListHref` string builder): everything here is verifiable
 * with Node's built-in test runner (returns-format.test.ts).
 *
 * Scope discipline (V1):
 *   - The page answers: ne oldu → hangi sipariş → kanıt → şu an ne
 *     oluyor → satıcıdan bir şey bekleniyor mu. Nothing else.
 *   - mark_handled is the only seller action; it means “seller has
 *     operationally handled the request” — never a refund/approval.
 *   - The list `toplam` is a page length, not a global total; the
 *     pagination rule here consumes only returned page sizes.
 *   - Missing-information / photo copy comes only from the backend's
 *     missing_fields / image_requirement contract — no invented
 *     warnings, no AI judgements, no countdowns.
 */

import type {
  ReturnImageRequirement,
  ReturnIssueType,
  ReturnMissingField,
  ReturnRequestDetail,
  ReturnRequestSummary,
  ReturnStatus,
  ReturnView,
} from "./returns";
import { ordersListHref } from "./orders-format.ts";

/* ------------------------------------------------------------------ */
/* View tabs (approved exact set)                                      */
/* ------------------------------------------------------------------ */

export type ReturnViewTab = {
  view: ReturnView;
  label: string;
};

/**
 * The four approved V1 views (order matches the page intent: attention
 * first). Backend `view` mapping:
 *   İncelenecekler   → view=action_required
 *   Bilgi Toplanıyor → view=collecting
 *   İlgilenilenler   → view=handled
 *   Tümü             → view=all
 * No count badges: `toplam` is a page length and would be a fake count.
 */
export const RETURN_VIEW_TABS: readonly ReturnViewTab[] = [
  { view: "action_required", label: "İncelenecekler" },
  { view: "collecting", label: "Bilgi Toplanıyor" },
  { view: "handled", label: "İlgilenilenler" },
  { view: "all", label: "Tümü" },
];

/** Default tab when the URL carries no (or an unknown) view. */
export const DEFAULT_RETURN_VIEW: ReturnView = "action_required";

/** Normalize the raw `view` search param to a backend view. */
export const normalizeReturnViewParam = (
  value: string | string[] | undefined,
): ReturnView => {
  const single = Array.isArray(value) ? value[0] : value;
  if (
    single === "collecting" ||
    single === "handled" ||
    single === "all"
  ) {
    return single;
  }
  return DEFAULT_RETURN_VIEW;
};

/* ------------------------------------------------------------------ */
/* Exact order-number search                                           */
/* ------------------------------------------------------------------ */

/**
 * Search maps 1:1 onto the backend's exact `external_order_number`
 * filter on `external_order_number_snapshot` (Query max_length=100).
 * Only surrounding whitespace is normalized; there is no fuzzy or
 * substring matching anywhere on this surface.
 */
export const RETURN_SEARCH_MAX_LENGTH = 100;

/**
 * Neutral seller-facing search copy. The backend does not guarantee any
 * marketplace number format, so the placeholder never teaches one
 * (no fabricated "Örn. TR123456" example) and never implies fuzzy
 * matching.
 */
export const RETURN_SEARCH_LABEL = "Sipariş numarası";
export const RETURN_SEARCH_PLACEHOLDER = "Sipariş numarasıyla ara";

export const normalizeReturnSearchParam = (
  value: string | string[] | undefined,
): string | null => {
  const single = Array.isArray(value) ? value[0] : value;
  if (typeof single !== "string") return null;
  const trimmed = single.trim().slice(0, RETURN_SEARCH_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
};

/* ------------------------------------------------------------------ */
/* Issue-type filter                                                   */
/* ------------------------------------------------------------------ */

/**
 * Backend-owned display labels (ISSUE_TYPE_DISPLAY_NAMES in
 * return_issue_service.py). URL/API always carries the canonical value,
 * never the label.
 */
export const RETURN_ISSUE_TYPE_OPTIONS: readonly {
  value: ReturnIssueType;
  label: string;
}[] = [
  { value: "RETURN_REQUEST", label: "İade talebi" },
  { value: "DAMAGED_ITEM", label: "Hasarlı ürün" },
  { value: "WRONG_ITEM", label: "Yanlış ürün" },
  {
    value: "PRINT_OR_PERSONALIZATION_ISSUE",
    label: "Baskı / kişiselleştirme sorunu",
  },
  { value: "DELIVERY_ISSUE", label: "Teslimat sorunu" },
  { value: "OTHER_ORDER_ISSUE", label: "Diğer sipariş sorunu" },
];

export const RETURN_ISSUE_TYPE_FILTER_ALL_LABEL = "Tüm sorun türleri";

const CANONICAL_ISSUE_TYPES = new Set<string>(
  RETURN_ISSUE_TYPE_OPTIONS.map((option) => option.value),
);

/**
 * Normalize the raw `type` search param: canonical values survive,
 * anything else is removed (treated as “no filter”).
 */
export const normalizeReturnIssueTypeParam = (
  value: string | string[] | undefined,
): ReturnIssueType | null => {
  const single = Array.isArray(value) ? value[0] : value;
  if (typeof single === "string" && CANONICAL_ISSUE_TYPES.has(single)) {
    return single as ReturnIssueType;
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* Selected request id                                                 */
/* ------------------------------------------------------------------ */

/**
 * Normalize the raw `request` search param: a positive integer id or
 * no selection. Zero, negatives, floats and non-numeric junk behave as
 * no selection.
 */
export const normalizeReturnRequestIdParam = (
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
/* URL builder (URL is the source of truth)                            */
/* ------------------------------------------------------------------ */

/**
 * Build the returns workspace URL. Offset never appears; pagination is
 * a transient client concern, so any filter change restarts from the
 * first page by construction. Default values are omitted to keep URLs
 * calm (`view=action_required` is the default and not written out).
 */
export const returnsWorkspaceHref = (input: {
  view: ReturnView;
  query: string | null;
  issueType: ReturnIssueType | null;
  requestId?: number | null;
}): string => {
  const params = new URLSearchParams();
  if (input.view !== DEFAULT_RETURN_VIEW) {
    params.set("view", input.view);
  }
  if (input.query !== null) {
    params.set("q", input.query);
  }
  if (input.issueType !== null) {
    params.set("type", input.issueType);
  }
  if (
    typeof input.requestId === "number" &&
    Number.isInteger(input.requestId) &&
    input.requestId > 0
  ) {
    params.set("request", String(input.requestId));
  }
  const qs = params.toString();
  return qs ? `/seller/returns?${qs}` : "/seller/returns";
};

/* ------------------------------------------------------------------ */
/* Status language (locked backend-led copy)                           */
/* ------------------------------------------------------------------ */

/**
 * One restrained state line per canonical status. Terracotta (accent)
 * belongs strictly to “waiting on the seller”; collecting is
 * structural/quiet, handled is muted. No color-only meaning — every
 * state carries text.
 */
export const RETURN_STATUS_DISPLAY: Record<
  ReturnStatus,
  { label: string; tone: "accent" | "muted" }
> = {
  SELLER_REVIEW_REQUIRED: { label: "Sizden bekleniyor", tone: "accent" },
  COLLECTING: { label: "Asistan bilgi topluyor", tone: "muted" },
  HANDLED: { label: "İlgilenildi", tone: "muted" },
};

/* ------------------------------------------------------------------ */
/* Identity lines                                                      */
/* ------------------------------------------------------------------ */

/** Phone fallback for a null `customer_phone`. */
export const RETURN_PHONE_MISSING_LABEL = "Telefon bilgisi yok";

export const getReturnPhoneDisplay = (
  request: Pick<ReturnRequestSummary, "customerPhone">,
): { text: string; isMissing: boolean } => {
  const phone = request.customerPhone;
  if (typeof phone === "string" && phone.trim().length > 0) {
    return { text: phone, isMissing: false };
  }
  return { text: RETURN_PHONE_MISSING_LABEL, isMissing: true };
};

/** Order number while collection is in progress. */
export const RETURN_ORDER_NUMBER_PENDING_LABEL = "Sipariş numarası bekleniyor";

/**
 * Absent snapshot: the pending phrase only where it is semantically
 * true (still COLLECTING); otherwise a neutral dash — never an
 * invented order number.
 */
export const getReturnOrderNumberDisplay = (
  request: Pick<
    ReturnRequestSummary,
    "externalOrderNumberSnapshot" | "status"
  >,
): { text: string; isPending: boolean } => {
  const number = request.externalOrderNumberSnapshot;
  if (typeof number === "string" && number.trim().length > 0) {
    return { text: number, isPending: false };
  }
  if (request.status === "COLLECTING") {
    return { text: RETURN_ORDER_NUMBER_PENDING_LABEL, isPending: true };
  }
  return { text: "—", isPending: true };
};

/**
 * Short queue excerpt of the exact backend `reason_text`. Visual
 * truncation happens in CSS; this helper only measures presence.
 * Returns null when no reason is collected yet (the row then renders
 * the quiet pending line instead of fabricated text).
 */
export const getReturnReasonExcerpt = (
  request: Pick<ReturnRequestSummary, "reasonText" | "status">,
): string | null => {
  const reason = request.reasonText;
  if (typeof reason === "string" && reason.trim().length > 0) {
    // The exact customer-provided text — trimmed of surrounding
    // whitespace only, never rewritten or summarized.
    return reason.trim();
  }
  return null;
};

export const RETURN_REASON_PENDING_LABEL = "Sorun açıklaması bekleniyor";

/* ------------------------------------------------------------------ */
/* Cross-panel navigation (approved, real ids only)                    */
/* ------------------------------------------------------------------ */

/** Visible label of the detail's conversation action. */
export const RETURN_OPEN_CONVERSATION_LABEL = "Konuşmayı aç";

/**
 * The canonical conversation route for the request's customer — the
 * same `/seller/conversations/{customerId}` shape the rest of the panel
 * uses. A valid positive customer id is required: no id, no link (no
 * fake identity, no phone-string matching).
 */
export const getReturnConversationHref = (
  customerId: number | null | undefined,
): string | null =>
  typeof customerId === "number" &&
  Number.isInteger(customerId) &&
  customerId > 0
    ? `/seller/conversations/${customerId}`
    : null;

/** Visible label of the detail's related-order action. */
export const RETURN_RELATED_ORDER_LABEL = "İlgili siparişi aç";

/**
 * Related order → the existing Orders worklist through its exact
 * external-order-number search (there is no `/seller/orders/{id}`
 * detail route to invent). The link exists only when the backend
 * returned a real related order carrying a usable external number;
 * an internal-only order id cannot be truthfully resolved by the
 * Orders surface, so it never fabricates navigation.
 */
export const getReturnRelatedOrderHref = (
  order: { externalOrderNumber: string | null } | null,
): string | null => {
  if (order === null) return null;
  const number = order.externalOrderNumber;
  if (typeof number !== "string" || number.trim().length === 0) return null;
  return ordersListHref({ view: "all", query: number.trim() });
};

/* ------------------------------------------------------------------ */
/* Timestamps                                                          */
/* ------------------------------------------------------------------ */

/**
 * A normal localized date-time. `updated_at` means “son güncelleme” —
 * never converted into waiting-time claims. Returns null for
 * unparseable input so the caller omits the line (parser guarantees a
 * string, not a valid date).
 */
export const formatReturnTimestamp = (iso: string): string | null => {
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
/* Missing information (backend allowlist, locked copy)                */
/* ------------------------------------------------------------------ */

export const RETURN_MISSING_FIELD_LABELS: Record<
  ReturnMissingField,
  string
> = {
  order_number: "Sipariş numarası bekleniyor",
  reason: "Sorun açıklaması bekleniyor",
  image: "Fotoğraf bekleniyor",
};

/* ------------------------------------------------------------------ */
/* Evidence presentation (§17 contract)                                */
/* ------------------------------------------------------------------ */

/**
 * The Kanıt section decision. Inputs are backend fields only:
 *
 *   evidence.length > 0                          → items (seller can open)
 *   REQUIRED + image in missing_fields           → photo_pending
 *   OPTIONAL/NOT_REQUESTED + no evidence         → none (omit quietly)
 *
 * There is deliberately no “Görsel yok” warning state: absence is only
 * remarkable when the seller asked for a photo and it is still missing.
 */
export type ReturnEvidenceSection =
  | { kind: "items" }
  | { kind: "photo_pending" }
  | { kind: "none" };

export const RETURN_PHOTO_PENDING_LABEL = "Fotoğraf bekleniyor";

export const getReturnEvidenceSection = (
  detail: Pick<ReturnRequestDetail, "evidence" | "missingFields"> & {
    request: Pick<ReturnRequestDetail["request"], "imageRequirementSnapshot">;
  },
): ReturnEvidenceSection => {
  if (detail.evidence.length > 0) {
    return { kind: "items" };
  }
  if (
    detail.request.imageRequirementSnapshot === "REQUIRED" &&
    detail.missingFields.includes("image")
  ) {
    return { kind: "photo_pending" };
  }
  return { kind: "none" };
};

/* ------------------------------------------------------------------ */
/* Pagination (page-length rule — `toplam` is never a global total)    */
/* ------------------------------------------------------------------ */

/** Fixed V1 page size (backend default). */
export const RETURN_PAGE_SIZE = 20;

/**
 * The only “is there another page?” signal: whether the backend
 * returned a full page. A short page (or an empty one) means the end.
 */
export const hasAnotherReturnsPage = (
  lastPageSize: number,
  pageSize: number = RETURN_PAGE_SIZE,
): boolean => lastPageSize > 0 && lastPageSize >= pageSize;

/**
 * Merge a freshly loaded page, deduping by request id while preserving
 * the backend's ordering verbatim (rows shifted between pages by newer
 * updates are not duplicated).
 */
export const mergeReturnsPage = (
  existing: readonly ReturnRequestSummary[],
  incoming: readonly ReturnRequestSummary[],
): ReturnRequestSummary[] => {
  const seen = new Set(existing.map((row) => row.id));
  const fresh = incoming.filter((row) => !seen.has(row.id));
  return [...existing, ...fresh];
};

/* ------------------------------------------------------------------ */
/* Empty-state copy (view-specific, calm)                              */
/* ------------------------------------------------------------------ */

export const returnListEmptyCopy = (
  view: ReturnView,
  hasActiveFilters: boolean,
): { title: string; description: string | null } => {
  if (hasActiveFilters) {
    return {
      title: "Bu arama veya filtreyle eşleşen kayıt bulunamadı.",
      description: null,
    };
  }
  if (view === "action_required") {
    return {
      title: "Şu anda sizden beklenen bir iade veya sorun yok.",
      description: null,
    };
  }
  if (view === "collecting") {
    return {
      title: "Asistanın bilgi topladığı aktif bir talep yok.",
      description: null,
    };
  }
  if (view === "handled") {
    return {
      title: "Henüz ilgilenildi olarak işaretlenen bir kayıt yok.",
      description: null,
    };
  }
  return {
    title: "Henüz iade veya sorun kaydı yok.",
    description:
      "Asistanın müşterilerden topladığı iade ve sorun bilgileri burada listelenir.",
  };
};

/* ------------------------------------------------------------------ */
/* Seller action — mark_handled (the only action)                      */
/* ------------------------------------------------------------------ */

/**
 * Whether the action may be offered: strictly the backend's own
 * capability signal — SELLER_REVIEW_REQUIRED rows the service flags as
 * `seller_action_required`.
 */
export const canMarkReturnHandled = (
  request: Pick<
    ReturnRequestDetail["request"],
    "status" | "sellerActionRequired"
  >,
): boolean =>
  request.status === "SELLER_REVIEW_REQUIRED" &&
  request.sellerActionRequired === true;

export const RETURN_ACTION_LABEL = "İlgilenildi olarak işaretle";
export const RETURN_ACTION_NOTE_LABEL = "Not (isteğe bağlı)";
export const RETURN_ACTION_NOTE_MAX_LENGTH = 2000;

export type MarkHandledPayload = {
  action: "mark_handled";
  expected_version: number;
  note?: string;
};

/**
 * Build the POST body from the detail the seller is looking at. The
 * expected_version is the rendered row's current version (optimistic
 * concurrency is mandatory). An empty/whitespace note is omitted; the
 * note's own characters are otherwise preserved and capped at the
 * backend limit.
 */
export const buildMarkHandledPayload = (input: {
  version: number;
  note: string;
}): MarkHandledPayload => {
  const note = input.note.trim();
  return {
    action: "mark_handled",
    expected_version: input.version,
    ...(note.length > 0
      ? { note: note.slice(0, RETURN_ACTION_NOTE_MAX_LENGTH) }
      : {}),
  };
};

/* ------------------------------------------------------------------ */
/* Photo preferences (canonical settings contract)                     */
/* ------------------------------------------------------------------ */

/**
 * Locked per-option meaning copy (§21), tightened to one short
 * consequence line per state. Semantics are unchanged: only REQUIRED
 * blocks review-readiness; a voluntarily sent photo is retained
 * regardless (so OPTIONAL/NOT_REQUESTED keep that truthful note).
 * The labels read like stable settings, not action commands.
 */
export const RETURN_IMAGE_REQUIREMENT_OPTIONS: readonly {
  value: ReturnImageRequirement;
  label: string;
  description: string;
}[] = [
  {
    value: "REQUIRED",
    label: "Fotoğraf gerekli",
    description:
      "Asistan müşteriden fotoğraf ister; fotoğraf gelmeden talep incelemeye hazır sayılmaz.",
  },
  {
    value: "OPTIONAL",
    label: "Fotoğraf isteğe bağlı",
    description:
      "Fotoğraf zorunlu tutulmaz; müşteri gönderirse kanıt olarak saklanabilir.",
  },
  {
    value: "NOT_REQUESTED",
    label: "Fotoğraf isteme",
    description:
      "Asistan fotoğraf istemez; müşteri yine de gönderirse kanıt olarak saklanabilir.",
  },
];

export type ReturnSettingUpdatePayload = {
  expected_version: number;
  image_requirement: ReturnImageRequirement;
};

/* ------------------------------------------------------------------ */
/* Settings reload — conflict notice lifecycle (409 regression fix)     */
/* ------------------------------------------------------------------ */

/** Locked calm copy shown after a concurrent-settings conflict (409). */
export const RETURN_SETTINGS_CONFLICT_NOTICE =
  "Tercihler başka bir işlemle değiştirildi; güncel değerler getirildi.";

/** Why the settings list inside the dialog is being (re)loaded. */
export type ReturnSettingsReloadReason = "normal" | "conflict_refetch";

/**
 * The conflict notice a settings reload leaves behind.
 *
 * Regression contract: the reload triggered BY a 409 used to clear the
 * notice it had just established, so the seller never saw why values
 * suddenly changed. The rule:
 *
 *   "normal" (dialog open / manual retry)
 *     → clear; stale notices must not linger across calm reloads.
 *
 *   "conflict_refetch" (the reload the 409 handler itself runs)
 *     → the locked conflict notice. The refetch is precisely what
 *       makes the notice true ("güncel değerler getirildi"), so the
 *       refetch must never erase its own feedback.
 *
 * Callers apply this ONLY on a successful reload: a failed reload shows
 * the dialog's own error state and clears the notice regardless, since
 * "values were refetched" must never be claimed when they were not.
 */
export const resolveReturnSettingsConflictNotice = (
  reason: ReturnSettingsReloadReason,
): string | null =>
  reason === "conflict_refetch" ? RETURN_SETTINGS_CONFLICT_NOTICE : null;

/**
 * Build the PATCH body for one row; expected_version is the value the
 * seller currently sees (explicit optimistic concurrency).
 */
export const buildReturnSettingUpdatePayload = (input: {
  version: number;
  imageRequirement: ReturnImageRequirement;
}): ReturnSettingUpdatePayload => ({
  expected_version: input.version,
  image_requirement: input.imageRequirement,
});

/* ------------------------------------------------------------------ */
/* Mutation error classification (409 vs transient)                    */
/* ------------------------------------------------------------------ */

/**
 * Classify a mutation failure from the raw HTTP status. 409 means the
 * record changed elsewhere: callers refetch and explain calmly. Any
 * other failure means the record stays and the seller can retry.
 */
export const classifyReturnMutationFailure = (
  status: number | null,
): "conflict" | "retryable" =>
  status === 409 ? "conflict" : "retryable";

/* ------------------------------------------------------------------ */
/* Evidence preview state machine + loader (dependency-injected)       */
/* ------------------------------------------------------------------ */

/**
 * The media-preview dialog's data flow, pure so success/failure is
 * testable without a DOM. Real wiring:
 * `returns-api.fetchReturnEvidenceMedia` + `URL.createObjectURL`.
 * On `error` the rest of the page is unaffected — only the dialog
 * shows calm feedback.
 */
export type ReturnEvidencePreviewState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; objectUrl: string; contentType: string | null }
  | { phase: "error" };

export const returnEvidencePreviewInitial: ReturnEvidencePreviewState = {
  phase: "idle",
};

export type ReturnEvidencePreviewEvent =
  | { type: "open" }
  | { type: "loaded"; objectUrl: string; contentType: string | null }
  | { type: "failed" }
  | { type: "close" };

export const reduceReturnEvidencePreview = (
  _state: ReturnEvidencePreviewState,
  event: ReturnEvidencePreviewEvent,
): ReturnEvidencePreviewState => {
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
 * `{ ok: false }` so the dialog shows calm feedback without leaking
 * provider URLs, host names or internal error codes.
 */
export const resolveReturnEvidencePreview = async (
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
