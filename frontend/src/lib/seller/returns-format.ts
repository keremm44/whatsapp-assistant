/**
 * Presentation helpers for the Seller “İade ve Sorunlar” workspace.
 *
 * Pure, environment-neutral module (the only runtime import is the
 * pure `ordersListHref` string builder): everything here is verifiable
 * with Node's built-in test runner (returns-format.test.ts).
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

export type ReturnViewTab = {
  view: ReturnView;
  label: string;
};

export const RETURN_VIEW_TABS: readonly ReturnViewTab[] = [
  { view: "action_required", label: "İncelenecekler" },
  { view: "collecting", label: "Bilgi Toplanıyor" },
  { view: "handled", label: "İlgilenilenler" },
  { view: "all", label: "Tümü" },
];

export const DEFAULT_RETURN_VIEW: ReturnView = "action_required";

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

export const RETURN_SEARCH_MAX_LENGTH = 100;
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

export const normalizeReturnIssueTypeParam = (
  value: string | string[] | undefined,
): ReturnIssueType | null => {
  const single = Array.isArray(value) ? value[0] : value;
  if (typeof single === "string" && CANONICAL_ISSUE_TYPES.has(single)) {
    return single as ReturnIssueType;
  }
  return null;
};

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

export const RETURN_STATUS_DISPLAY: Record<
  ReturnStatus,
  { label: string; tone: "accent" | "success" | "muted" }
> = {
  SELLER_REVIEW_REQUIRED: { label: "Sizden bekleniyor", tone: "accent" },
  COLLECTING: { label: "Asistan bilgi topluyor", tone: "muted" },
  HANDLED: { label: "İlgilenildi", tone: "success" },
};

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

export const RETURN_ORDER_NUMBER_PENDING_LABEL = "Sipariş numarası bekleniyor";

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

export const getReturnReasonExcerpt = (
  request: Pick<ReturnRequestSummary, "reasonText" | "status">,
): string | null => {
  const reason = request.reasonText;
  if (typeof reason === "string" && reason.trim().length > 0) {
    return reason.trim();
  }
  return null;
};

export const RETURN_REASON_PENDING_LABEL = "Sorun açıklaması bekleniyor";

export const RETURN_OPEN_CONVERSATION_LABEL = "Konuşmayı aç";

export const getReturnConversationHref = (
  customerId: number | null | undefined,
): string | null =>
  typeof customerId === "number" &&
  Number.isInteger(customerId) &&
  customerId > 0
    ? `/seller/conversations/${customerId}`
    : null;

export const RETURN_RELATED_ORDER_LABEL = "İlgili siparişi aç";

/**
 * Related order → exact selection in the existing Orders workbench.
 * The backend relationship id is authoritative; marketplace number is
 * display/search data and is not needed to identify the record.
 */
export const getReturnRelatedOrderHref = (
  order: { id: number } | null,
): string | null => {
  if (
    order === null ||
    !Number.isInteger(order.id) ||
    order.id <= 0
  ) {
    return null;
  }
  return ordersListHref({ view: "all", query: null, orderId: order.id });
};

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

export const RETURN_MISSING_FIELD_LABELS: Record<
  ReturnMissingField,
  string
> = {
  order_number: "Sipariş numarası bekleniyor",
  reason: "Sorun açıklaması bekleniyor",
  image: "Fotoğraf bekleniyor",
};

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

export const RETURN_PAGE_SIZE = 20;

export const hasAnotherReturnsPage = (
  lastPageSize: number,
  pageSize: number = RETURN_PAGE_SIZE,
): boolean => lastPageSize > 0 && lastPageSize >= pageSize;

export const mergeReturnsPage = (
  existing: readonly ReturnRequestSummary[],
  incoming: readonly ReturnRequestSummary[],
): ReturnRequestSummary[] => {
  const seen = new Set(existing.map((row) => row.id));
  const fresh = incoming.filter((row) => !seen.has(row.id));
  return [...existing, ...fresh];
};

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

/** Backend capability remains the primary gate; status is a defensive invariant. */
export const canMarkReturnHandled = (
  request: Pick<
    ReturnRequestDetail["request"],
    "status" | "sellerActionRequired"
  >,
): boolean =>
  request.sellerActionRequired === true &&
  request.status === "SELLER_REVIEW_REQUIRED";

export const RETURN_ACTION_LABEL = "İlgilenildi olarak işaretle";
export const RETURN_ACTION_NOTE_LABEL = "Not (isteğe bağlı)";
export const RETURN_ACTION_NOTE_MAX_LENGTH = 2000;

export type MarkHandledPayload = {
  action: "mark_handled";
  expected_version: number;
  note?: string;
};

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

export const RETURN_SETTINGS_CONFLICT_NOTICE =
  "Tercihler başka bir işlemle değiştirildi; güncel değerler getirildi.";

export type ReturnSettingsReloadReason = "normal" | "conflict_refetch";

export const resolveReturnSettingsConflictNotice = (
  reason: ReturnSettingsReloadReason,
): string | null =>
  reason === "conflict_refetch" ? RETURN_SETTINGS_CONFLICT_NOTICE : null;

export const buildReturnSettingUpdatePayload = (input: {
  version: number;
  imageRequirement: ReturnImageRequirement;
}): ReturnSettingUpdatePayload => ({
  expected_version: input.version,
  image_requirement: input.imageRequirement,
});

export const classifyReturnMutationFailure = (
  status: number | null,
): "conflict" | "retryable" =>
  status === 409 ? "conflict" : "retryable";

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
