/**
 * Seller “Cevaplanamayan Sorular” — backend-derived contract layer.
 *
 * Contract module for the V1 knowledge-gap workspace at
 * /seller/unanswered. The backend endpoints in `protected_routes.py`
 * (list + detail + actions) with `unanswered_question_service.py` and
 * `database.py` are the single source of truth; the frontend never
 * reads tables directly and never invents AI/matching semantics.
 *
 * This module is deliberately dependency-free (types + parsers only,
 * zero runtime imports) so the contract can be verified with Node's
 * built-in test runner without a frontend test framework. Fetchers
 * live in `unanswered-api.ts`; presentation helpers in
 * `unanswered-format.ts`.
 *
 * Proven facts enforced by the parsers (inspected, never assumed):
 *
 *   - Canonical statuses OPEN | ANSWERED | DISMISSED and views
 *     action_required | answered | dismissed | all are the backend's
 *     exact allowlists (migration 017 CHECK + route pattern). Unknown
 *     values are contract errors, never coerced.
 *   - List `toplam` is the RETURNED PAGE LENGTH — the database layer
 *     computes it as `len(result.data)` of the paginated range. It is
 *     NOT a global count; parsing validates its shape only and
 *     pagination logic must never treat it as a total.
 *   - List rows use present_group_summary keys (`question`); detail
 *     and action responses carry the full group row
 *     (`canonical_question`, dismiss_note, answered_at, ...). Both are
 *     parsed against their own exact shapes.
 *   - Occurrences carry internal ids (message_id included) that V1
 *     must never render; only question_text, occurred_at and a valid
 *     customer_id (for the conversation link) are consumed.
 *   - The only actions are set_answer and dismiss, via the shared
 *     actions endpoint with mandatory expected_version.
 */

/* ------------------------------------------------------------------ */
/* Parse primitives (local, identical discipline to returns.ts)        */
/* ------------------------------------------------------------------ */

/** Parser-level error prefix; resolvers map it to `unavailable`. */
const UNANSWERED_CONTRACT_PREFIX = "unanswered_invalid_";

const contractError = (field: string): Error =>
  new Error(`${UNANSWERED_CONTRACT_PREFIX}${field}`);

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

const readLiteral = <T extends string>(
  raw: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T => {
  const value = readRequiredString(raw, key);
  if (!allowed.includes(value as T)) {
    throw contractError(key);
  }
  return value as T;
};

/* ------------------------------------------------------------------ */
/* Allowlisted enums (backend-owned)                                   */
/* ------------------------------------------------------------------ */

/** protected_routes.seller_unanswered_questions view pattern. */
export const UNANSWERED_VIEWS = [
  "action_required",
  "answered",
  "dismissed",
  "all",
] as const;
export type UnansweredView = (typeof UNANSWERED_VIEWS)[number];

const isUnansweredView = (value: unknown): value is UnansweredView =>
  typeof value === "string" &&
  (UNANSWERED_VIEWS as readonly string[]).includes(value);

/** database.VALID_UNANSWERED_STATUSES / migration 017 CHECK. */
export const UNANSWERED_STATUSES = [
  "OPEN",
  "ANSWERED",
  "DISMISSED",
] as const;
export type UnansweredStatus = (typeof UNANSWERED_STATUSES)[number];

/** UnansweredQuestionActionRequest action Literal. */
export const UNANSWERED_ACTIONS = ["set_answer", "dismiss"] as const;
export type UnansweredAction = (typeof UNANSWERED_ACTIONS)[number];

/* ------------------------------------------------------------------ */
/* Typed contract (camelCase)                                          */
/* ------------------------------------------------------------------ */

/**
 * One queue row — the backend present_group_summary keys. `question`
 * is the canonical customer wording, answer the saved one (nullable).
 */
export type UnansweredQuestionSummary = {
  id: number;
  /** Canonical question text; rendered byte-exact, never rewritten. */
  question: string;
  status: UnansweredStatus;
  /** Saved answer for ANSWERED rows; parsed, not rendered in V1 rows. */
  answer: string | null;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  version: number;
  /** Backend-authoritative primary-action signal. */
  sellerActionRequired: boolean;
};

export type UnansweredListPage = {
  view: UnansweredView;
  /** Returned-page length (`toplam`) — never a global total. */
  pageCount: number;
  limit: number;
  offset: number;
  questions: UnansweredQuestionSummary[];
};

/** Full group row (detail + action responses). */
export type UnansweredQuestionRecord = {
  id: number;
  /** Canonical question text; rendered byte-exact, never rewritten. */
  canonicalQuestion: string;
  status: UnansweredStatus;
  answerText: string | null;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  version: number;
  answeredAt: string | null;
  dismissedAt: string | null;
  dismissNote: string | null;
  createdAt: string;
  updatedAt: string;
  /** Backend-authoritative primary-action signal. */
  sellerActionRequired: boolean;
};

/**
 * One occurrence. Internal ids are validated but never rendered; only
 * question_text, occurred_at and a valid customer_id (conversation
 * link) are consumed by the UI.
 */
export type UnansweredOccurrence = {
  id: number;
  customerId: number | null;
  messageId: number | null;
  /** The actual wording the customer used; rendered byte-exact. */
  questionText: string;
  occurredAt: string;
};

export type UnansweredQuestionDetail = {
  question: UnansweredQuestionRecord;
  occurrences: UnansweredOccurrence[];
};

export type UnansweredActionResult = {
  action: UnansweredAction;
  changed: boolean;
  question: UnansweredQuestionRecord;
};

/* ------------------------------------------------------------------ */
/* Parsers                                                             */
/* ------------------------------------------------------------------ */

const parseUnansweredSummary = (raw: unknown): UnansweredQuestionSummary => {
  if (!isPlainObject(raw)) throw contractError("question");
  return {
    id: readRequiredPositiveInteger(raw, "id"),
    question: readRequiredString(raw, "question"),
    status: readLiteral(raw, "status", UNANSWERED_STATUSES),
    answer: readNullableString(raw, "answer"),
    occurrenceCount: readRequiredNonNegativeInteger(raw, "occurrence_count"),
    firstSeenAt: readRequiredString(raw, "first_seen_at"),
    lastSeenAt: readRequiredString(raw, "last_seen_at"),
    version: readRequiredPositiveInteger(raw, "version"),
    sellerActionRequired: readRequiredBoolean(raw, "seller_action_required"),
  };
};

const parseUnansweredRecord = (raw: unknown): UnansweredQuestionRecord => {
  if (!isPlainObject(raw)) throw contractError("question");
  return {
    id: readRequiredPositiveInteger(raw, "id"),
    canonicalQuestion: readRequiredString(raw, "canonical_question"),
    status: readLiteral(raw, "status", UNANSWERED_STATUSES),
    answerText: readNullableString(raw, "answer_text"),
    occurrenceCount: readRequiredNonNegativeInteger(raw, "occurrence_count"),
    firstSeenAt: readRequiredString(raw, "first_seen_at"),
    lastSeenAt: readRequiredString(raw, "last_seen_at"),
    version: readRequiredPositiveInteger(raw, "version"),
    answeredAt: readNullableString(raw, "answered_at"),
    dismissedAt: readNullableString(raw, "dismissed_at"),
    dismissNote: readNullableString(raw, "dismiss_note"),
    createdAt: readRequiredString(raw, "created_at"),
    updatedAt: readRequiredString(raw, "updated_at"),
    sellerActionRequired: readRequiredBoolean(raw, "seller_action_required"),
  };
};

const parseUnansweredListPage = (raw: unknown): UnansweredListPage => {
  if (!isPlainObject(raw)) throw contractError("response");
  const viewRaw = readKey(raw, "view");
  if (!isUnansweredView(viewRaw)) throw contractError("view");
  const limitRaw = readKey(raw, "limit");
  if (
    typeof limitRaw !== "number" ||
    !Number.isInteger(limitRaw) ||
    limitRaw < 1 ||
    limitRaw > 100
  ) {
    throw contractError("limit_shape");
  }
  const questionsRaw = readKey(raw, "questions");
  if (!Array.isArray(questionsRaw)) throw contractError("questions");
  return {
    view: viewRaw,
    // Shape-only validation: the value is the returned page length
    // (database.py: toplam = len(result.data)), never a global total.
    pageCount: readRequiredNonNegativeInteger(raw, "toplam"),
    limit: limitRaw,
    offset: readRequiredNonNegativeInteger(raw, "offset"),
    questions: questionsRaw.map(parseUnansweredSummary),
  };
};

const parseUnansweredOccurrence = (raw: unknown): UnansweredOccurrence => {
  if (!isPlainObject(raw)) throw contractError("occurrence");
  return {
    id: readRequiredPositiveInteger(raw, "id"),
    customerId: readNullablePositiveInteger(raw, "customer_id"),
    messageId: readNullablePositiveInteger(raw, "message_id"),
    questionText: readRequiredString(raw, "question_text"),
    occurredAt: readRequiredString(raw, "occurred_at"),
  };
};

const parseUnansweredDetail = (raw: unknown): UnansweredQuestionDetail => {
  if (!isPlainObject(raw)) throw contractError("response");
  const occurrencesRaw = readKey(raw, "occurrences");
  if (
    occurrencesRaw !== null &&
    occurrencesRaw !== undefined &&
    !Array.isArray(occurrencesRaw)
  ) {
    throw contractError("occurrences");
  }
  return {
    question: parseUnansweredRecord(readKey(raw, "question")),
    occurrences: ((occurrencesRaw ?? []) as unknown[]).map(
      parseUnansweredOccurrence,
    ),
  };
};

const parseUnansweredActionResult = (
  raw: unknown,
): UnansweredActionResult => {
  if (!isPlainObject(raw)) throw contractError("response");
  const action = readLiteral(raw, "action", UNANSWERED_ACTIONS);
  return {
    action,
    // Idempotent repeats report changed=false; non-boolean is a contract
    // failure.
    changed: readRequiredBoolean(raw, "changed"),
    question: parseUnansweredRecord(readKey(raw, "question")),
  };
};

/* ------------------------------------------------------------------ */
/* Parse entry points (used by unanswered-api.ts fetchers)             */
/* ------------------------------------------------------------------ */

export const parseUnansweredListResponse = (raw: unknown): UnansweredListPage =>
  parseUnansweredListPage(raw);

/* ------------------------------------------------------------------ */
/* V2 cursor list page (GET /seller/unanswered-questions/v2 —         */
/* contracts/seller-lists-v2.json). Response is EXACTLY               */
/* {items, has_more, next_cursor}. Item shape is the legacy group      */
/* summary, so rows render unchanged.                                  */
/* ------------------------------------------------------------------ */

export type UnansweredListPageV2 = {
  items: UnansweredQuestionSummary[];
  hasMore: boolean;
  nextCursor: string | null;
};

const parseUnansweredListPageV2 = (raw: unknown): UnansweredListPageV2 => {
  if (!isPlainObject(raw)) throw contractError("v2_response");
  const itemsRaw = readKey(raw, "items");
  if (!Array.isArray(itemsRaw)) throw contractError("v2_items");
  const hasMore = readKey(raw, "has_more");
  if (typeof hasMore !== "boolean") throw contractError("v2_has_more");
  const nextCursorRaw = readKey(raw, "next_cursor");
  if (nextCursorRaw !== null && typeof nextCursorRaw !== "string") {
    throw contractError("v2_next_cursor");
  }
  if (!hasMore && nextCursorRaw !== null) {
    throw contractError("v2_next_cursor_unexpected");
  }
  if (hasMore && (typeof nextCursorRaw !== "string" || nextCursorRaw === "")) {
    throw contractError("v2_next_cursor_missing");
  }
  return {
    items: itemsRaw.map(parseUnansweredSummary),
    hasMore,
    nextCursor: nextCursorRaw === null ? null : nextCursorRaw,
  };
};

export const parseUnansweredListV2Response = (
  raw: unknown,
): UnansweredListPageV2 => parseUnansweredListPageV2(raw);

export const parseUnansweredDetailResponse = (
  raw: unknown,
): UnansweredQuestionDetail => parseUnansweredDetail(raw);

export const parseUnansweredActionResponse = (
  raw: unknown,
): UnansweredActionResult => parseUnansweredActionResult(raw);

export const UNANSWERED_CONTRACT_ERROR_PREFIX = UNANSWERED_CONTRACT_PREFIX;
