/**
 * Presentation helpers for the Seller “Cevaplanamayan Sorular” workspace.
 *
 * Pure, environment-neutral, zero-runtime-import module (the
 * conversation-route import is a pure string builder): everything here
 * is verifiable with Node's built-in test runner
 * (unanswered-format.test.ts).
 *
 * Scope discipline (V1):
 *   - The page answers: soru → ne kadar sık geldi → müşteriler nasıl
 *     sordu → doğru cevap ne → asistan bundan sonra neyi kullanabilir.
 *   - Saving an answer stores seller-approved text for future
 *     occurrences of the same canonical question. It never messages
 *     past conversations — and the UI copy says so explicitly, without
 *     AI/fuzzy/semantic promises.
 *   - The list `toplam` is the returned page length, not a global
 *     total; pagination consumes only returned page sizes.
 *   - No KPI chrome, no tab counts, no search.
 */

import type {
  UnansweredAction,
  UnansweredQuestionSummary,
  UnansweredStatus,
  UnansweredView,
} from "./unanswered";

/* ------------------------------------------------------------------ */
/* View tabs (approved exact set)                                      */
/* ------------------------------------------------------------------ */

export type UnansweredViewTab = {
  view: UnansweredView;
  label: string;
};

/**
 * The four approved V1 views (attention first). Backend `view`
 * mapping:
 *   Cevap Bekleyenler      → view=action_required (status OPEN)
 *   Cevaplananlar          → view=answered        (status ANSWERED)
 *   Görmezden Gelinenler   → view=dismissed       (status DISMISSED)
 *   Tümü                   → view=all
 * No count badges: `toplam` is a page length and would be a fake count.
 */
export const UNANSWERED_VIEW_TABS: readonly UnansweredViewTab[] = [
  { view: "action_required", label: "Cevap Bekleyenler" },
  { view: "answered", label: "Cevaplananlar" },
  { view: "dismissed", label: "Görmezden Gelinenler" },
  { view: "all", label: "Tümü" },
];

/**
 * The seller product view defaults to the action queue. The backend
 * route defaults to `all`; the frontend always requests a view
 * explicitly, so unknown URL state normalizes here.
 */
export const DEFAULT_UNANSWERED_VIEW: UnansweredView = "action_required";

/** Normalize the raw `view` search param to a backend view. */
export const normalizeUnansweredViewParam = (
  value: string | string[] | undefined,
): UnansweredView => {
  const single = Array.isArray(value) ? value[0] : value;
  if (single === "answered" || single === "dismissed" || single === "all") {
    return single;
  }
  return DEFAULT_UNANSWERED_VIEW;
};

/* ------------------------------------------------------------------ */
/* Selected question id                                                */
/* ------------------------------------------------------------------ */

/**
 * Normalize the raw `question` search param: a positive integer group
 * id or no selection. Zero, negatives, floats and junk behave as no
 * selection.
 */
export const normalizeUnansweredQuestionIdParam = (
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
 * Build the workspace URL. There is deliberately no `q` param — the
 * backend has no search contract in V1 — and offset never appears:
 * changing the tab drops the selection and restarts pagination from
 * the first page by construction.
 */
export const unansweredWorkspaceHref = (input: {
  view: UnansweredView;
  questionId?: number | null;
}): string => {
  const params = new URLSearchParams();
  if (input.view !== DEFAULT_UNANSWERED_VIEW) {
    params.set("view", input.view);
  }
  if (
    typeof input.questionId === "number" &&
    Number.isInteger(input.questionId) &&
    input.questionId > 0
  ) {
    params.set("question", String(input.questionId));
  }
  const qs = params.toString();
  return qs ? `/seller/unanswered?${qs}` : "/seller/unanswered";
};

/* ------------------------------------------------------------------ */
/* Status language (locked copy)                                       */
/* ------------------------------------------------------------------ */

/**
 * One restrained state line per canonical status. Terracotta (accent)
 * belongs strictly to the answer-waiting state; answered is calm
 * petrol (resolved), dismissed is muted. Never color-only — every
 * state carries text.
 */
export const UNANSWERED_STATUS_DISPLAY: Record<
  UnansweredStatus,
  { label: string; tone: "accent" | "resolved" | "muted" }
> = {
  OPEN: { label: "Cevap bekliyor", tone: "accent" },
  ANSWERED: { label: "Cevaplandı", tone: "resolved" },
  DISMISSED: { label: "Görmezden gelindi", tone: "muted" },
};

/* ------------------------------------------------------------------ */
/* Identity / metadata lines                                           */
/* ------------------------------------------------------------------ */

/** “n kez soruldu” — the real backend occurrence count, verbatim. */
export const getUnansweredOccurrenceCountLabel = (count: number): string =>
  `${count} kez soruldu`;

/**
 * List-row date (“Son görülme: 12 Ağu 2026”). Returns null for
 * unparseable input so the caller omits the line.
 */
export const formatUnansweredDate = (iso: string): string | null => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

/**
 * Detail timestamp (with time). first/last seen and occurred_at are
 * factual instants — never converted into waiting-time claims.
 */
export const formatUnansweredTimestamp = (iso: string): string | null => {
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
/* Pagination (page-length rule — `toplam` is never a global total)    */
/* ------------------------------------------------------------------ */

/** Fixed V1 page size (backend default). */
export const UNANSWERED_PAGE_SIZE = 20;

/**
 * The only “is there another page?” signal: whether the backend
 * returned a full page. A short page (or an empty one) means the end.
 */
export const hasAnotherUnansweredPage = (
  lastPageSize: number,
  pageSize: number = UNANSWERED_PAGE_SIZE,
): boolean => lastPageSize > 0 && lastPageSize >= pageSize;

/**
 * Merge a freshly loaded page, deduping by group id while preserving
 * the backend ordering (last_seen_at DESC, id DESC) verbatim.
 */
export const mergeUnansweredPage = (
  existing: readonly UnansweredQuestionSummary[],
  incoming: readonly UnansweredQuestionSummary[],
): UnansweredQuestionSummary[] => {
  const seen = new Set(existing.map((row) => row.id));
  const fresh = incoming.filter((row) => !seen.has(row.id));
  return [...existing, ...fresh];
};

/* ------------------------------------------------------------------ */
/* Empty-state copy (locked, view-specific, calm)                      */
/* ------------------------------------------------------------------ */

export const unansweredListEmptyCopy = (
  view: UnansweredView,
): { title: string; description: string | null } => {
  if (view === "action_required") {
    return {
      title: "Şu anda cevap bekleyen bir soru yok.",
      description: null,
    };
  }
  if (view === "answered") {
    return { title: "Henüz kayıtlı bir cevap yok.", description: null };
  }
  if (view === "dismissed") {
    return {
      title: "Henüz görmezden gelinen bir soru yok.",
      description: null,
    };
  }
  return {
    title: "Henüz cevaplanamayan soru kaydı yok.",
    description:
      "Asistanın emin olmadığı için size bıraktığı müşteri soruları burada listelenir.",
  };
};

/** Empty detail guidance (locked). */
export const UNANSWERED_DETAIL_EMPTY_GUIDANCE =
  "İncelemek için listeden bir soru seçin.";

/** Calm 404 for a selection that no longer resolves (locked). */
export const UNANSWERED_DETAIL_NOT_FOUND_TITLE = "Bu soru artık bulunamıyor.";

/* ------------------------------------------------------------------ */
/* Conversation link (context navigation only)                         */
/* ------------------------------------------------------------------ */

export const UNANSWERED_OPEN_CONVERSATION_LABEL = "Konuşmayı aç";

/**
 * The canonical conversation route for an occurrence's customer —
 * the same route shape conversations-format.conversationDetailHref
 * produces without the attention filter (`/seller/conversations/{id}`).
 * Inlined here so this module keeps its zero-runtime-import discipline
 * (the conversations format chain pulls alias imports Node's built-in
 * test runner cannot resolve).
 *
 * A valid positive customer_id is required — no id, no link (no fake
 * identity, no invented fallback).
 */
export const getUnansweredConversationHref = (
  customerId: number | null,
): string | null =>
  typeof customerId === "number" &&
  Number.isInteger(customerId) &&
  customerId > 0
    ? `/seller/conversations/${customerId}`
    : null;

/* ------------------------------------------------------------------ */
/* Section / action vocabulary (locked copy)                           */
/* ------------------------------------------------------------------ */

export const UNANSWERED_OCCURRENCES_TITLE = "Müşteriler nasıl sordu?";

export const UNANSWERED_ANSWER_SECTION_TITLE = "Asistana vereceğiniz cevap";
export const UNANSWERED_SAVED_ANSWER_TITLE = "Kayıtlı cevap";
export const UNANSWERED_ANSWER_LABEL = "Cevap";
export const UNANSWERED_SAVE_ANSWER_LABEL = "Cevabı kaydet";
export const UNANSWERED_EDIT_ANSWER_LABEL = "Cevabı düzenle";
export const UNANSWERED_UPDATE_ANSWER_LABEL = "Değişiklikleri kaydet";
export const UNANSWERED_ADD_ANSWER_LABEL = "Cevap ekle";

/**
 * The future-only semantics of a saved answer — visible next to the
 * form, never buried in a tooltip. Two claims, both true:
 *   1. it is NOT sent to past conversations;
 *   2. the assistant may use it when the same question comes again.
 * No AI-learning, fuzzy-matching or training promises anywhere.
 */
export const UNANSWERED_FUTURE_ONLY_NOTE =
  "Bu cevap geçmiş konuşmalara gönderilmez. Bundan sonra aynı soru tekrar geldiğinde asistan bu kayıtlı cevabı kullanabilir.";

/**
 * The Rules distinction, in seller language. The seller has two
 * knowledge-like mechanisms (Mesaja Göre Cevaplar and these saved
 * answers); this one-liner states plainly that saving here does NOT
 * create a message-based answer — the saved answer stays on this
 * question only. No technical vocabulary,
 * no AI-learning claims. Rendered next to the form and next to the
 * saved-answer state.
 */
export const UNANSWERED_NOT_A_RULE_NOTE =
  "Bu cevap Mesaja Göre Cevaplar bölümüne eklenmez; yalnızca bu soru için kayıtlı kalır.";

/* Dismiss — a stored business state, never described as deletion. */
export const UNANSWERED_DISMISS_TRIGGER_LABEL = "Bu soruyu görmezden gel";
export const UNANSWERED_DISMISS_CONFIRM_LABEL = "Görmezden gel";
/**
 * Inspected backend semantics (migration 017, not changed here):
 *   - dismiss sets the group to DISMISSED and keeps that status when
 *     the same normalized question occurs again (record occurrence
 *     increments last_seen_at but does not reopen OPEN)
 *   - set_answer is still allowed from DISMISSED, so the seller can
 *     later open Görmezden Gelinenler and save an answer
 * The confirmation copy must state both facts before the seller
 * confirms. It must not claim the dismiss is temporary or that the
 * same question will automatically return to Cevap Bekleyenler.
 */
export const UNANSWERED_DISMISS_PERSISTENCE_NOTE =
  "Bu soruyu görmezden geldiğinizde aynı soru tekrar geldiğinde Cevap Bekleyenler listesine otomatik dönmez.";
export const UNANSWERED_DISMISS_LATER_ANSWER_NOTE =
  "Daha sonra Görmezden Gelinenler bölümünden tekrar açıp cevap kaydedebilirsiniz.";
export const UNANSWERED_DISMISS_EXPLANATION = UNANSWERED_DISMISS_PERSISTENCE_NOTE;
export const UNANSWERED_DISMISS_NOTE_LABEL = "Not (isteğe bağlı)";

/* ------------------------------------------------------------------ */
/* Action capabilities (backend-supported transitions only)            */
/* ------------------------------------------------------------------ */

/**
 * set_answer is supported from every status: OPEN and DISMISSED move
 * to ANSWERED; ANSWERED replaces the saved answer. The UI surfaces it
 * differently per status (editor / edit / “Cevap ekle”).
 */
export const canAnswerUnanswered = (status: UnansweredStatus): boolean =>
  status === "OPEN" || status === "ANSWERED" || status === "DISMISSED";

/**
 * dismiss is a normal action only from OPEN. The backend rejects
 * dismiss on ANSWERED (409) and a DISMISSED row is already dismissed —
 * so it is never offered there.
 */
export const canDismissUnanswered = (status: UnansweredStatus): boolean =>
  status === "OPEN";

/* ------------------------------------------------------------------ */
/* Mutation payloads                                                   */
/* ------------------------------------------------------------------ */

export const UNANSWERED_ANSWER_MAX_LENGTH = 4000;
export const UNANSWERED_DISMISS_NOTE_MAX_LENGTH = 1000;

export type SetAnswerPayload = {
  action: "set_answer";
  expected_version: number;
  answer: string;
};

/**
 * Build the set_answer body. expected_version is the version the
 * seller is looking at (mandatory optimistic concurrency). The answer
 * is trimmed of surrounding whitespace and capped at the backend
 * limit; a `note` key can never appear on this action (the backend
 * forbids it).
 */
export const buildSetAnswerPayload = (input: {
  version: number;
  answer: string;
}): SetAnswerPayload => ({
  action: "set_answer",
  expected_version: input.version,
  answer: input.answer.trim().slice(0, UNANSWERED_ANSWER_MAX_LENGTH),
});

export type DismissPayload = {
  action: "dismiss";
  expected_version: number;
  note?: string;
};

/**
 * Build the dismiss body. An empty/whitespace note is omitted; the
 * note's own characters are otherwise preserved and capped at the
 * backend limit. An `answer` key can never appear on this action.
 */
export const buildDismissPayload = (input: {
  version: number;
  note: string;
}): DismissPayload => {
  const note = input.note.trim();
  return {
    action: "dismiss",
    expected_version: input.version,
    ...(note.length > 0
      ? { note: note.slice(0, UNANSWERED_DISMISS_NOTE_MAX_LENGTH) }
      : {}),
  };
};

/* ------------------------------------------------------------------ */
/* Mutation error classification                                       */
/* ------------------------------------------------------------------ */

/**
 * 409 — the record changed elsewhere (or the transition is not
 * allowed from its current state): refetch truth, keep the draft.
 * 422 — validation: calm field-level feedback, keep the draft.
 * anything else — transient: keep everything, allow retry.
 */
export const classifyUnansweredMutationFailure = (
  status: number | null,
): "conflict" | "validation" | "retryable" => {
  if (status === 409) return "conflict";
  if (status === 422) return "validation";
  return "retryable";
};

/* ------------------------------------------------------------------ */
/* Success routing (backend truth decides what the view shows next)    */
/* ------------------------------------------------------------------ */

/**
 * Where the workspace goes after a successful mutation, so the seller
 * never sees a stale state:
 *
 *   set_answer from action_required  → the question leaves the OPEN
 *                                      queue: clear the selection, the
 *                                      navigation re-resolves the fresh
 *                                      first page.
 *   set_answer from answered         → refresh: the same question now
 *                                      shows its truthful new answer.
 *   set_answer from all              → refresh: truthful ANSWERED state.
 *   set_answer from dismissed        → the question leaves the dismissed
 *                                      queue: clear the selection.
 *   dismiss from action_required     → clear the selection, fresh queue.
 *   dismiss from all                 → refresh: truthful DISMISSED.
 *
 * Nothing is ever faked locally in place of backend truth.
 */
export type UnansweredMutationResolution = "clear_selection" | "refresh";

export const resolveUnansweredMutationSuccess = (
  view: UnansweredView,
  action: UnansweredAction,
): UnansweredMutationResolution => {
  if (action === "set_answer") {
    if (view === "action_required" || view === "dismissed") {
      return "clear_selection";
    }
    return "refresh";
  }
  // dismiss
  if (view === "action_required") {
    return "clear_selection";
  }
  return "refresh";
};

/* ------------------------------------------------------------------ */
/* Success → record-gate lifecycle (single testable decision)          */
/* ------------------------------------------------------------------ */

/**
 * How the shared question-record mutation gate must terminate after a
 * SUCCESSFUL mutation, derived from the business resolution (which
 * stays solely in resolveUnansweredMutationSuccess — this helper never
 * duplicates the view+action matrix):
 *
 *   "refresh"           → the gate OWNS the one authoritative
 *                         router.refresh(): finish(token,
 *                         { refresh: true }), so the sibling action
 *                         stays locked until the fresh state/version
 *                         has landed. The parent must NOT issue its
 *                         own refresh for this path (exactly one
 *                         authoritative transition).
 *
 *   "navigation_unmount" → clear-selection: the parent's router.push
 *                         removes the selected question, and the
 *                         keyed detail (and its gate instance)
 *                         unmounts with it. The success path
 *                         deliberately does NOT finish the gate —
 *                         the stale question detail must never become
 *                         interactable again while still mounted.
 */
export type UnansweredSuccessGateMode = "refresh" | "navigation_unmount";

export const gateModeForUnansweredSuccess = (
  resolution: UnansweredMutationResolution,
): UnansweredSuccessGateMode =>
  resolution === "refresh" ? "refresh" : "navigation_unmount";
