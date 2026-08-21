/**
 * Seller Conversations — backend-derived contract layer.
 *
 * This module is the conversations-side analogue of
 * `lib/seller/dashboard-tasks.ts`. The backend endpoints under
 * `/seller/conversations*` are the single source of truth for the
 * seller's conversation workbench. The frontend never reads
 * `customers`, `messages`, `orders`, `return_issue_requests`, or
 * `unanswered_question_groups` directly and never infers business
 * state from any other client-side signal.
 *
 * The module is environment-neutral: every function takes an
 * already-resolved Supabase access token. Server Components pass a
 * token from the server-side cookie session (see
 * `conversations-server.ts`); interactive Client Components pass a
 * token from the browser session (see
 * `lib/supabase/client.ts#getBrowserAccessToken`). It does not import
 * any Supabase client.
 *
 * The contract is taken verbatim from the backend:
 *   - `GET  /seller/conversations`                  (list)
 *     -> `migrations/020_add_seller_panel_read_models.sql`
 *        `get_seller_conversation_list` RPC +
 *        `seller_panel_service.list_conversations`
 *   - `GET  /seller/conversations/{id}`             (detail)
 *     -> migration 020 `get_seller_conversation_detail` RPC +
 *        `seller_panel_service.get_conversation_detail`
 *   - `GET  /seller/conversations/{id}/control`     (control read)
 *     -> `conversation_control_service.read_conversation_control`
 *   - `POST /seller/conversations/{id}/control`     (control mutate)
 *     -> `conversation_control_service.mutate_conversation_control`
 *
 * Proven facts enforced by the parsers (each claim documented at the
 * parse site):
 *
 *   - Control states are exactly the four values allowlisted in
 *     migration 013's CHECK constraints
 *     (ASSISTANT_ACTIVE / SELLER_TAKEN_OVER / RETURN_REVIEW /
 *     ASSISTANT_PAUSED).
 *   - `attention_reason` is exactly the five-value CASE output of the
 *     list SQL (return_review / seller_taken_over / assistant_paused /
 *     order_review / unanswered_question) or NULL, and it is NULL
 *     exactly when `needs_attention` is FALSE (SQL CASE/COALESCE
 *     invariant, enforced here as a cross-field check).
 *   - The list is ordered by the backend
 *     (`needs_attention DESC, sort_at DESC, customer_id DESC`).
 *     The frontend preserves that order verbatim and never re-sorts.
 *   - The detail endpoint's `control` object carries the RAW state
 *     and version only. The user-facing `display_name` and the
 *     capability map come exclusively from the dedicated control
 *     endpoints (`GET/POST .../control`) — the detail payload never
 *     contains them.
 *   - `messages[].direction` is "incoming" | "outgoing" — the only
 *     two values `chat_service.save_message` ever writes.
 *     `was_auto_replied = true` marks assistant-composed replies;
 *     an outgoing message without that flag has NO proven author in
 *     the contract, so the UI must render it as neutral outgoing and
 *     must never label it "Satıcı".
 *   - `media_available` is the only media signal; the read model
 *     deliberately never exposes a media URL.
 */

import { apiFetchWithAccessToken } from "@/lib/api/authenticated";
import {
  buildConversationListQuery,
  parseConversationControlStateFilter,
} from "./conversations-query.ts";

export { buildConversationListQuery } from "./conversations-query.ts";

/**
 * Parser-level error tag prefix. The resolver layer maps any error
 * whose message starts with this prefix to `state: "unavailable"`.
 */
const CONVERSATIONS_CONTRACT_PREFIX = "conversations_invalid_";

/* ------------------------------------------------------------------ */
/* Allowlisted enums (backend-owned)                                   */
/* ------------------------------------------------------------------ */

/** Migration 013 CHECK constraints; conversation_control_service. */
export const CONVERSATION_CONTROL_STATES = [
  "ASSISTANT_ACTIVE",
  "SELLER_TAKEN_OVER",
  "RETURN_REVIEW",
  "ASSISTANT_PAUSED",
] as const;
export type ConversationControlState =
  (typeof CONVERSATION_CONTROL_STATES)[number];

/** List SQL `attention_reason` CASE output (migration 020). */
export const CONVERSATION_ATTENTION_REASONS = [
  "return_review",
  "seller_taken_over",
  "assistant_paused",
  "order_review",
  "unanswered_question",
] as const;
export type ConversationAttentionReason =
  (typeof CONVERSATION_ATTENTION_REASONS)[number];

/** `VALID_STATES` / `STATE_TYPES` in backend/database.py. */
const CONVERSATION_FLOW_STATES = [
  "NORMAL",
  "AWAITING_ORDER_CONFIRMATION",
  "AWAITING_ORDER_PRODUCT",
  "AWAITING_ORDER_NUMBER",
  "AWAITING_IMAGE",
  "AWAITING_CUSTOM_TEXT",
  "AWAITING_ORDER_FIELD",
  "AWAITING_SELLER",
] as const;
export type ConversationFlowState = (typeof CONVERSATION_FLOW_STATES)[number];

const CONVERSATION_FLOW_STATE_TYPES = [
  "no_lock",
  "soft_lock",
  "informational",
] as const;
export type ConversationFlowStateType =
  (typeof CONVERSATION_FLOW_STATE_TYPES)[number];

/**
 * Fixed state -> state_type mapping from `STATE_TYPES` in
 * backend/database.py. Enforced as a cross-field invariant.
 */
const FLOW_STATE_TO_TYPE: Record<ConversationFlowState, ConversationFlowStateType> = {
  NORMAL: "no_lock",
  AWAITING_ORDER_CONFIRMATION: "soft_lock",
  AWAITING_ORDER_PRODUCT: "soft_lock",
  AWAITING_ORDER_NUMBER: "soft_lock",
  AWAITING_IMAGE: "soft_lock",
  AWAITING_CUSTOM_TEXT: "soft_lock",
  AWAITING_ORDER_FIELD: "soft_lock",
  AWAITING_SELLER: "informational",
};

/**
 * The read models only ever select orders in these two statuses
 * (migration 020 `WHERE o.status IN (...)`) even though the orders
 * table also allows COMPLETE.
 */
const ACTIVE_ORDER_STATUSES = ["COLLECTING", "SELLER_REVIEW_REQUIRED"] as const;
export type ConversationOrderStatus = (typeof ACTIVE_ORDER_STATUSES)[number];

/** `RETURN_ISSUE_TYPES` in backend/database.py. */
export const RETURN_ISSUE_TYPES = [
  "RETURN_REQUEST",
  "DAMAGED_ITEM",
  "WRONG_ITEM",
  "PRINT_OR_PERSONALIZATION_ISSUE",
  "DELIVERY_ISSUE",
  "OTHER_ORDER_ISSUE",
] as const;
export type ReturnIssueType = (typeof RETURN_ISSUE_TYPES)[number];

/** Read models select only these two active statuses (migration 020). */
const ACTIVE_RETURN_ISSUE_STATUSES = [
  "COLLECTING",
  "SELLER_REVIEW_REQUIRED",
] as const;
export type ConversationReturnIssueStatus =
  (typeof ACTIVE_RETURN_ISSUE_STATUSES)[number];

/** `RETURN_IMAGE_REQUIREMENTS` in backend/database.py. */
const RETURN_IMAGE_REQUIREMENTS = [
  "REQUIRED",
  "OPTIONAL",
  "NOT_REQUESTED",
] as const;
export type ReturnImageRequirement =
  (typeof RETURN_IMAGE_REQUIREMENTS)[number];

/** `ConversationControlAction` in conversation_control_service.py. */
export const CONVERSATION_CONTROL_ACTIONS = [
  "take_over",
  "resume_assistant",
  "pause_assistant",
  "activate_assistant",
] as const;
export type ConversationControlAction =
  (typeof CONVERSATION_CONTROL_ACTIONS)[number];

/* ------------------------------------------------------------------ */
/* Typed contract (camelCase)                                          */
/* ------------------------------------------------------------------ */

/**
 * Customer identity block. `name` and `whatsappNumber` follow the
 * underlying `customers` columns: `whatsapp_number` is always written
 * on insert, `name` is optional — both are still typed nullable
 * because the base table predates the migration chain and the SQL
 * projection applies no COALESCE. `isBlocked` / `totalMessages` are
 * written as non-null defaults at insert (`False` / `0`).
 */
export type ConversationCustomerSummary = {
  id: number;
  name: string | null;
  whatsappNumber: string | null;
  isBlocked: boolean;
  mutedUntil: string | null;
  isMuted: boolean;
  totalMessages: number;
  lastMessageAt: string | null;
};

/** Detail payload adds the two moderation columns from migration 001. */
export type ConversationCustomerDetail = ConversationCustomerSummary & {
  blockedReason: string | null;
  blockedAt: string | null;
};

export type ConversationMessage = {
  id: number;
  direction: "incoming" | "outgoing";
  /** NULL for pure media messages; content column is nullable. */
  content: string | null;
  /**
   * Free-form provider string (<= 40 chars, default "text"). NOT an
   * enum — callers must rely on `mediaAvailable`, never on parsing
   * this field, to decide media presentation.
   */
  messageType: string;
  wasAutoReplied: boolean;
  mediaAvailable: boolean;
  createdAt: string;
};

export type ConversationMessagePage = {
  limit: number;
  hasMore: boolean;
  /**
   * Oldest visible message id; non-null exactly when `hasMore` is
   * true (SQL invariant, enforced in the parser).
   */
  nextBeforeMessageId: number | null;
};

/**
 * Raw conversation-state block (flow machine). V1 parses it as part
 * of the contract but deliberately does NOT render it.
 */
export type ConversationFlowStateBlock = {
  state: ConversationFlowState;
  stateType: ConversationFlowStateType;
  updatedAt: string;
};

/**
 * Raw control summary as embedded in list rows and the detail
 * payload. Contains state + version for optimistic concurrency but
 * NO display name and NO capabilities — those come only from the
 * dedicated control endpoint (`ConversationControlView`).
 */
export type ConversationControlSummary = {
  state: ConversationControlState;
  changedAt: string;
  changedByProfileId: number | null;
  reasonCode: string | null;
  reasonNote: string | null;
  resumeAfterMessageId: number | null;
  version: number;
};

/** Backend-owned capability map (conversation_control_service._CAPABILITIES). */
export type ConversationCapabilities = {
  canTakeOver: boolean;
  canResumeAssistant: boolean;
  canPauseAssistant: boolean;
  canActivateAssistant: boolean;
};

/**
 * Authoritative control presentation from
 * `GET/POST /seller/conversations/{id}/control`. `displayName` is a
 * backend-owned Turkish label; the parser enforces it matches the
 * backend's own CONTROL_DISPLAY_NAMES mapping exactly.
 */
export type ConversationControlView = {
  customerId: number;
  control: ConversationControlSummary & { displayName: string };
  capabilities: ConversationCapabilities;
};

/** List-shape active order context (migration 020 list projection). */
export type ConversationOrderContext = {
  id: number;
  customerId: number;
  status: ConversationOrderStatus;
  externalOrderNumber: string | null;
  productNameSnapshot: string | null;
  version: number;
  updatedAt: string;
  sellerActionRequired: boolean;
};

/**
 * Detail-shape active order. Snapshot columns follow the orders table
 * (migration 014): all snapshot/review fields are nullable; status,
 * version, created_at, updated_at are NOT NULL.
 */
export type ConversationOrderDetail = ConversationOrderContext & {
  productId: number | null;
  customerPhoneSnapshot: string | null;
  imageMessageId: number | null;
  customText: string | null;
  reviewReasonCode: string | null;
  reviewReasonNote: string | null;
  createdAt: string;
};

/** List-shape active return/issue context. */
export type ConversationReturnIssueContext = {
  id: number;
  customerId: number;
  issueType: ReturnIssueType;
  status: ConversationReturnIssueStatus;
  version: number;
  updatedAt: string;
  sellerActionRequired: boolean;
};

/**
 * Detail-shape active return/issue (migration 016): order linkage and
 * snapshot/reason fields nullable; `imageRequirementSnapshot` is NOT
 * NULL (default 'OPTIONAL'); `reviewRequiredAt` nullable.
 */
export type ConversationReturnIssueDetail =
  ConversationReturnIssueContext & {
    orderId: number | null;
    externalOrderNumberSnapshot: string | null;
    productNameSnapshot: string | null;
    reasonText: string | null;
    imageRequirementSnapshot: ReturnImageRequirement;
    reviewReasonCode: string | null;
    reviewNote: string | null;
    createdAt: string;
    reviewRequiredAt: string | null;
  };

/** List-shape open unanswered group (single, latest occurrence join). */
export type ConversationUnansweredContext = {
  id: number;
  question: string | null;
  occurrenceCount: number;
  lastSeenAt: string | null;
  version: number;
  sellerActionRequired: boolean;
};

/** Detail-shape open unanswered group (adds first_seen_at). */
export type ConversationUnansweredGroup = ConversationUnansweredContext & {
  firstSeenAt: string | null;
};

/**
 * One control audit entry. Rendered read-only as the "Konuşma
 * geçmişi" section of the conversation context (transition + optional
 * reason note + timestamp only; the technical fields are parsed for
 * contract completeness but never seller-facing).
 * from_state / to_state are NOT NULL with CHECK constraints
 * (migration 013), so both are strict allowlist parse sites.
 */
export type ConversationControlHistoryEntry = {
  id: number;
  fromState: ConversationControlState;
  toState: ConversationControlState;
  reasonCode: string | null;
  reasonNote: string | null;
  changedByProfileId: number | null;
  triggerMessageId: number | null;
  resumeAfterMessageId: number | null;
  previousVersion: number | null;
  newVersion: number | null;
  createdAt: string;
};

/** One conversation row in the seller's queue. */
export type ConversationListItem = {
  customer: ConversationCustomerSummary;
  lastMessage: ConversationMessage | null;
  conversationState: ConversationFlowStateBlock | null;
  control: ConversationControlSummary | null;
  activeOrder: ConversationOrderContext | null;
  activeReturnIssue: ConversationReturnIssueContext | null;
  /** The list SQL joins at most ONE open group (LATERAL LIMIT 1). */
  openUnanswered: ConversationUnansweredContext | null;
  needsAttention: boolean;
  attentionReason: ConversationAttentionReason | null;
};

export type ConversationListPage = {
  total: number;
  limit: number;
  offset: number;
  attentionOnly: boolean;
  /** Echo of the optional backend `control_state` filter; null when omitted. */
  controlState: ConversationControlState | null;
  conversations: ConversationListItem[];
};

export type ConversationDetail = {
  customer: ConversationCustomerDetail;
  conversationState: ConversationFlowStateBlock | null;
  /** Raw state/version only — never presentation. */
  control: ConversationControlSummary | null;
  messages: ConversationMessage[];
  messagePage: ConversationMessagePage;
  controlHistory: ConversationControlHistoryEntry[];
  activeOrder: ConversationOrderDetail | null;
  activeReturnIssue: ConversationReturnIssueDetail | null;
  openUnanswered: ConversationUnansweredGroup[];
};

/* ------------------------------------------------------------------ */
/* Parser primitives (mirrors dashboard-tasks.ts discipline)           */
/* ------------------------------------------------------------------ */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value > 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value >= 0;

const contractError = (tag: string): Error =>
  new Error(`${CONVERSATIONS_CONTRACT_PREFIX}${tag}`);

const readKey = (obj: Record<string, unknown>, key: string): unknown => {
  if (!(key in obj)) {
    throw contractError(`${key}_missing`);
  }
  return obj[key];
};

const readRequiredString = (
  obj: Record<string, unknown>,
  key: string,
): string => {
  const v = readKey(obj, key);
  if (typeof v !== "string") {
    throw contractError(`${key}_type`);
  }
  return v;
};

const readNullableString = (
  obj: Record<string, unknown>,
  key: string,
): string | null => {
  const v = readKey(obj, key);
  if (v === null) return null;
  if (typeof v !== "string") {
    throw contractError(`${key}_type`);
  }
  return v;
};

const readRequiredBoolean = (
  obj: Record<string, unknown>,
  key: string,
): boolean => {
  const v = readKey(obj, key);
  if (typeof v !== "boolean") {
    throw contractError(`${key}_type`);
  }
  return v;
};

const readRequiredPositiveInteger = (
  obj: Record<string, unknown>,
  key: string,
): number => {
  const v = readKey(obj, key);
  if (!isPositiveInteger(v)) {
    throw contractError(`${key}_shape`);
  }
  return v;
};

const readNullablePositiveInteger = (
  obj: Record<string, unknown>,
  key: string,
): number | null => {
  const v = readKey(obj, key);
  if (v === null) return null;
  if (!isPositiveInteger(v)) {
    throw contractError(`${key}_shape`);
  }
  return v;
};

const readRequiredNonNegativeInteger = (
  obj: Record<string, unknown>,
  key: string,
): number => {
  const v = readKey(obj, key);
  if (!isNonNegativeInteger(v)) {
    throw contractError(`${key}_shape`);
  }
  return v;
};

/* ------------------------------------------------------------------ */
/* Block parsers                                                       */
/* ------------------------------------------------------------------ */

const isControlState = (value: unknown): value is ConversationControlState =>
  typeof value === "string" &&
  (CONVERSATION_CONTROL_STATES as readonly string[]).includes(value);

const isAttentionReason = (
  value: unknown,
): value is ConversationAttentionReason =>
  typeof value === "string" &&
  (CONVERSATION_ATTENTION_REASONS as readonly string[]).includes(value);

const isFlowState = (value: unknown): value is ConversationFlowState =>
  typeof value === "string" &&
  (CONVERSATION_FLOW_STATES as readonly string[]).includes(value);

const isOrderStatus = (value: unknown): value is ConversationOrderStatus =>
  typeof value === "string" &&
  (ACTIVE_ORDER_STATUSES as readonly string[]).includes(value);

const isReturnIssueType = (value: unknown): value is ReturnIssueType =>
  typeof value === "string" &&
  (RETURN_ISSUE_TYPES as readonly string[]).includes(value);

const isReturnIssueStatus = (
  value: unknown,
): value is ConversationReturnIssueStatus =>
  typeof value === "string" &&
  (ACTIVE_RETURN_ISSUE_STATUSES as readonly string[]).includes(value);

const isImageRequirement = (
  value: unknown,
): value is ReturnImageRequirement =>
  typeof value === "string" &&
  (RETURN_IMAGE_REQUIREMENTS as readonly string[]).includes(value);

const parseCustomerSummary = (
  raw: unknown,
): ConversationCustomerSummary => {
  if (!isPlainObject(raw)) throw contractError("customer");
  const id = readRequiredPositiveInteger(raw, "id");
  const name = readNullableString(raw, "name");
  const whatsappNumber = readNullableString(raw, "whatsapp_number");
  const isBlocked = readRequiredBoolean(raw, "is_blocked");
  const mutedUntil = readNullableString(raw, "muted_until");
  const isMuted = readRequiredBoolean(raw, "is_muted");
  const totalMessages = readRequiredNonNegativeInteger(raw, "total_messages");
  const lastMessageAt = readNullableString(raw, "last_message_at");
  return {
    id,
    name,
    whatsappNumber,
    isBlocked,
    mutedUntil,
    isMuted,
    totalMessages,
    lastMessageAt,
  };
};

const parseCustomerDetail = (raw: unknown): ConversationCustomerDetail => {
  const summary = parseCustomerSummary(raw);
  if (!isPlainObject(raw)) throw contractError("customer");
  const blockedReason = readNullableString(raw, "blocked_reason");
  const blockedAt = readNullableString(raw, "blocked_at");
  return { ...summary, blockedReason, blockedAt };
};

const parseMessage = (raw: unknown): ConversationMessage => {
  if (!isPlainObject(raw)) throw contractError("message");
  const id = readRequiredPositiveInteger(raw, "id");
  const directionRaw = readKey(raw, "direction");
  if (directionRaw !== "incoming" && directionRaw !== "outgoing") {
    throw contractError("message_direction");
  }
  const content = readNullableString(raw, "content");
  const messageType = readRequiredString(raw, "message_type");
  const wasAutoReplied = readRequiredBoolean(raw, "was_auto_replied");
  const mediaAvailable = readRequiredBoolean(raw, "media_available");
  const createdAt = readRequiredString(raw, "created_at");
  return {
    id,
    direction: directionRaw,
    content,
    messageType,
    wasAutoReplied,
    mediaAvailable,
    createdAt,
  };
};

const parseFlowStateBlock = (
  raw: unknown,
): ConversationFlowStateBlock => {
  if (!isPlainObject(raw)) throw contractError("conversation_state");
  const stateRaw = readKey(raw, "state");
  if (!isFlowState(stateRaw)) {
    throw contractError("conversation_state_state");
  }
  const stateTypeRaw = readKey(raw, "state_type");
  if (
    typeof stateTypeRaw !== "string" ||
    !(CONVERSATION_FLOW_STATE_TYPES as readonly string[]).includes(stateTypeRaw)
  ) {
    throw contractError("conversation_state_type");
  }
  const stateType = stateTypeRaw as ConversationFlowStateType;
  // Fixed mapping owned by the backend STATE_TYPES table; a payload
  // that violates it is a contract error, not something to repair.
  if (FLOW_STATE_TO_TYPE[stateRaw] !== stateType) {
    throw contractError("conversation_state_type_mismatch");
  }
  const updatedAt = readRequiredString(raw, "updated_at");
  return { state: stateRaw, stateType, updatedAt };
};

const parseControlSummary = (raw: unknown): ConversationControlSummary => {
  if (!isPlainObject(raw)) throw contractError("control");
  const stateRaw = readKey(raw, "state");
  if (!isControlState(stateRaw)) {
    throw contractError("control_state");
  }
  const changedAt = readRequiredString(raw, "changed_at");
  const changedByProfileId = readNullablePositiveInteger(
    raw,
    "changed_by_profile_id",
  );
  const reasonCode = readNullableString(raw, "reason_code");
  const reasonNote = readNullableString(raw, "reason_note");
  const resumeAfterMessageId = readNullablePositiveInteger(
    raw,
    "resume_after_message_id",
  );
  const version = readRequiredPositiveInteger(raw, "version");
  return {
    state: stateRaw,
    changedAt,
    changedByProfileId,
    reasonCode,
    reasonNote,
    resumeAfterMessageId,
    version,
  };
};

const parseOrderContext = (raw: unknown): ConversationOrderContext => {
  if (!isPlainObject(raw)) throw contractError("active_order");
  const id = readRequiredPositiveInteger(raw, "id");
  const customerId = readRequiredPositiveInteger(raw, "customer_id");
  const statusRaw = readKey(raw, "status");
  if (!isOrderStatus(statusRaw)) {
    throw contractError("active_order_status");
  }
  const externalOrderNumber = readNullableString(raw, "external_order_number");
  const productNameSnapshot = readNullableString(raw, "product_name_snapshot");
  const version = readRequiredPositiveInteger(raw, "version");
  const updatedAt = readRequiredString(raw, "updated_at");
  const sellerActionRequired = readRequiredBoolean(raw, "seller_action_required");
  return {
    id,
    customerId,
    status: statusRaw,
    externalOrderNumber,
    productNameSnapshot,
    version,
    updatedAt,
    sellerActionRequired,
  };
};

const parseOrderDetail = (raw: unknown): ConversationOrderDetail => {
  const base = parseOrderContext(raw);
  if (!isPlainObject(raw)) throw contractError("active_order");
  const productId = readNullablePositiveInteger(raw, "product_id");
  const customerPhoneSnapshot = readNullableString(
    raw,
    "customer_phone_snapshot",
  );
  const imageMessageId = readNullablePositiveInteger(raw, "image_message_id");
  const customText = readNullableString(raw, "custom_text");
  const reviewReasonCode = readNullableString(raw, "review_reason_code");
  const reviewReasonNote = readNullableString(raw, "review_reason_note");
  const createdAt = readRequiredString(raw, "created_at");
  return {
    ...base,
    productId,
    customerPhoneSnapshot,
    imageMessageId,
    customText,
    reviewReasonCode,
    reviewReasonNote,
    createdAt,
  };
};

const parseReturnIssueContext = (
  raw: unknown,
): ConversationReturnIssueContext => {
  if (!isPlainObject(raw)) throw contractError("active_return_issue");
  const id = readRequiredPositiveInteger(raw, "id");
  const customerId = readRequiredPositiveInteger(raw, "customer_id");
  const issueTypeRaw = readKey(raw, "issue_type");
  if (!isReturnIssueType(issueTypeRaw)) {
    throw contractError("return_issue_type");
  }
  const statusRaw = readKey(raw, "status");
  if (!isReturnIssueStatus(statusRaw)) {
    throw contractError("return_issue_status");
  }
  const version = readRequiredPositiveInteger(raw, "version");
  const updatedAt = readRequiredString(raw, "updated_at");
  const sellerActionRequired = readRequiredBoolean(raw, "seller_action_required");
  return {
    id,
    customerId,
    issueType: issueTypeRaw,
    status: statusRaw,
    version,
    updatedAt,
    sellerActionRequired,
  };
};

const parseReturnIssueDetail = (
  raw: unknown,
): ConversationReturnIssueDetail => {
  const base = parseReturnIssueContext(raw);
  if (!isPlainObject(raw)) throw contractError("active_return_issue");
  const orderId = readNullablePositiveInteger(raw, "order_id");
  const externalOrderNumberSnapshot = readNullableString(
    raw,
    "external_order_number_snapshot",
  );
  const productNameSnapshot = readNullableString(raw, "product_name_snapshot");
  const reasonText = readNullableString(raw, "reason_text");
  const imageRequirementRaw = readKey(raw, "image_requirement_snapshot");
  if (!isImageRequirement(imageRequirementRaw)) {
    throw contractError("return_issue_image_requirement");
  }
  const reviewReasonCode = readNullableString(raw, "review_reason_code");
  const reviewNote = readNullableString(raw, "review_note");
  const createdAt = readRequiredString(raw, "created_at");
  const reviewRequiredAt = readNullableString(raw, "review_required_at");
  return {
    ...base,
    orderId,
    externalOrderNumberSnapshot,
    productNameSnapshot,
    reasonText,
    imageRequirementSnapshot: imageRequirementRaw,
    reviewReasonCode,
    reviewNote,
    createdAt,
    reviewRequiredAt,
  };
};

const parseUnansweredContext = (
  raw: unknown,
): ConversationUnansweredContext => {
  if (!isPlainObject(raw)) throw contractError("open_unanswered");
  const id = readRequiredPositiveInteger(raw, "id");
  const question = readNullableString(raw, "question");
  const occurrenceCount = readRequiredPositiveInteger(
    raw,
    "occurrence_count",
  );
  const lastSeenAt = readNullableString(raw, "last_seen_at");
  const version = readRequiredPositiveInteger(raw, "version");
  const sellerActionRequired = readRequiredBoolean(raw, "seller_action_required");
  return {
    id,
    question,
    occurrenceCount,
    lastSeenAt,
    version,
    sellerActionRequired,
  };
};

const parseUnansweredGroup = (
  raw: unknown,
): ConversationUnansweredGroup => {
  const base = parseUnansweredContext(raw);
  if (!isPlainObject(raw)) throw contractError("open_unanswered");
  const firstSeenAt = readNullableString(raw, "first_seen_at");
  return { ...base, firstSeenAt };
};

/** Parse a nullable-or-object block (used for context joins). */
const parseNullableBlock = <T>(
  obj: Record<string, unknown>,
  key: string,
  parse: (raw: unknown) => T,
): T | null => {
  const raw = readKey(obj, key);
  if (raw === null) return null;
  return parse(raw);
};

const parseMessagePage = (raw: unknown): ConversationMessagePage => {
  if (!isPlainObject(raw)) throw contractError("message_page");
  const limitRaw = readKey(raw, "limit");
  if (!isPositiveInteger(limitRaw) || limitRaw > 100) {
    throw contractError("message_page_limit");
  }
  const hasMore = readRequiredBoolean(raw, "has_more");
  const nextBeforeMessageId = readNullablePositiveInteger(
    raw,
    "next_before_message_id",
  );
  // SQL invariant: next_before_message_id is set exactly when
  // has_more is true (it is the oldest visible message id).
  if (hasMore && nextBeforeMessageId === null) {
    throw contractError("message_page_cursor_missing");
  }
  if (!hasMore && nextBeforeMessageId !== null) {
    throw contractError("message_page_cursor_unexpected");
  }
  return { limit: limitRaw, hasMore, nextBeforeMessageId };
};

const parseControlHistoryEntry = (
  raw: unknown,
): ConversationControlHistoryEntry => {
  if (!isPlainObject(raw)) throw contractError("control_history_entry");
  const id = readRequiredPositiveInteger(raw, "id");
  const fromStateRaw = readKey(raw, "from_state");
  if (!isControlState(fromStateRaw)) {
    throw contractError("control_history_from_state");
  }
  const toStateRaw = readKey(raw, "to_state");
  if (!isControlState(toStateRaw)) {
    throw contractError("control_history_to_state");
  }
  return {
    id,
    fromState: fromStateRaw,
    toState: toStateRaw,
    reasonCode: readNullableString(raw, "reason_code"),
    reasonNote: readNullableString(raw, "reason_note"),
    changedByProfileId: readNullablePositiveInteger(
      raw,
      "changed_by_profile_id",
    ),
    triggerMessageId: readNullablePositiveInteger(raw, "trigger_message_id"),
    resumeAfterMessageId: readNullablePositiveInteger(
      raw,
      "resume_after_message_id",
    ),
    previousVersion: readNullablePositiveInteger(raw, "previous_version"),
    newVersion: readNullablePositiveInteger(raw, "new_version"),
    createdAt: readRequiredString(raw, "created_at"),
  };
};

/* ------------------------------------------------------------------ */
/* Response parsers                                                    */
/* ------------------------------------------------------------------ */

const parseConversationListItem = (raw: unknown): ConversationListItem => {
  if (!isPlainObject(raw)) throw contractError("conversation");
  const customer = parseCustomerSummary(readKey(raw, "customer"));
  const lastMessage = parseNullableBlock(raw, "last_message", parseMessage);
  const conversationState = parseNullableBlock(
    raw,
    "conversation_state",
    parseFlowStateBlock,
  );
  const control = parseNullableBlock(raw, "control", parseControlSummary);
  const activeOrder = parseNullableBlock(raw, "active_order", parseOrderContext);
  const activeReturnIssue = parseNullableBlock(
    raw,
    "active_return_issue",
    parseReturnIssueContext,
  );
  const openUnanswered = parseNullableBlock(
    raw,
    "open_unanswered",
    parseUnansweredContext,
  );
  const needsAttention = readRequiredBoolean(raw, "needs_attention");
  const attentionReasonRaw = readKey(raw, "attention_reason");
  if (attentionReasonRaw !== null && !isAttentionReason(attentionReasonRaw)) {
    throw contractError("attention_reason");
  }
  const attentionReason = isAttentionReason(attentionReasonRaw)
    ? attentionReasonRaw
    : null;
  // SQL invariant from migration 020: attention_reason is non-null
  // exactly when needs_attention is true.
  if (needsAttention && attentionReason === null) {
    throw contractError("attention_reason_missing");
  }
  if (!needsAttention && attentionReason !== null) {
    throw contractError("attention_reason_unexpected");
  }
  return {
    customer,
    lastMessage,
    conversationState,
    control,
    activeOrder,
    activeReturnIssue,
    openUnanswered,
    needsAttention,
    attentionReason,
  };
};

const parseConversationListPage = (raw: unknown): ConversationListPage => {
  if (!isPlainObject(raw)) throw contractError("response");
  // `toplam` is the total filtered count (mirrors the dashboard's
  // Turkish key); limit/offset are echoed from the request.
  const total = readRequiredNonNegativeInteger(raw, "toplam");
  const limitRaw = readKey(raw, "limit");
  if (!isPositiveInteger(limitRaw) || limitRaw > 100) {
    throw contractError("limit_shape");
  }
  const offset = readRequiredNonNegativeInteger(raw, "offset");
  const attentionOnly = readRequiredBoolean(raw, "attention_only");
  const controlState = parseOptionalControlStateFilter(raw["control_state"]);
  const conversationsRaw = readKey(raw, "conversations");
  if (!Array.isArray(conversationsRaw)) {
    throw contractError("conversations");
  }
  const conversations = conversationsRaw.map(parseConversationListItem);
  return {
    total,
    limit: limitRaw,
    offset,
    attentionOnly,
    controlState,
    conversations,
  };
};

const parseOptionalControlStateFilter = (
  value: unknown,
): ConversationControlState | null => {
  try {
    return parseConversationControlStateFilter(value);
  } catch {
    throw contractError("control_state");
  }
};

/* ------------------------------------------------------------------ */
/* V2 cursor list page (GET /seller/conversations/v2 —                */
/* contracts/seller-lists-v2.json). Response is EXACTLY               */
/* {items, has_more, next_cursor}. Item shape is legacy-compatible    */
/* (same fields the conversation-list parser reads), backed by the    */
/* stable activity cursor read model (migration 033).                 */
/* ------------------------------------------------------------------ */

export type ConversationListPageV2 = {
  items: ConversationListItem[];
  hasMore: boolean;
  nextCursor: string | null;
};

const parseConversationListPageV2 = (
  raw: unknown,
): ConversationListPageV2 => {
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
    items: itemsRaw.map(parseConversationListItem),
    hasMore,
    nextCursor: nextCursorRaw === null ? null : nextCursorRaw,
  };
};

export const parseConversationListV2Response = (
  raw: unknown,
): ConversationListPageV2 => parseConversationListPageV2(raw);

const parseConversationDetail = (raw: unknown): ConversationDetail => {
  if (!isPlainObject(raw)) throw contractError("response");
  const customer = parseCustomerDetail(readKey(raw, "customer"));
  const conversationState = parseNullableBlock(
    raw,
    "conversation_state",
    parseFlowStateBlock,
  );
  const control = parseNullableBlock(raw, "control", parseControlSummary);
  const messagesRaw = readKey(raw, "messages");
  if (!Array.isArray(messagesRaw)) throw contractError("messages");
  const messages = messagesRaw.map(parseMessage);
  const messagePage = parseMessagePage(readKey(raw, "message_page"));
  const controlHistoryRaw = readKey(raw, "control_history");
  if (!Array.isArray(controlHistoryRaw)) {
    throw contractError("control_history");
  }
  const controlHistory = controlHistoryRaw.map(parseControlHistoryEntry);
  const activeOrder = parseNullableBlock(raw, "active_order", parseOrderDetail);
  const activeReturnIssue = parseNullableBlock(
    raw,
    "active_return_issue",
    parseReturnIssueDetail,
  );
  const openUnansweredRaw = readKey(raw, "open_unanswered");
  if (!Array.isArray(openUnansweredRaw)) {
    throw contractError("open_unanswered");
  }
  const openUnanswered = openUnansweredRaw.map(parseUnansweredGroup);
  return {
    customer,
    conversationState,
    control,
    messages,
    messagePage,
    controlHistory,
    activeOrder,
    activeReturnIssue,
    openUnanswered,
  };
};

/**
 * Backend-owned display names (conversation_control_service
 * .CONTROL_DISPLAY_NAMES). The control endpoint echoes them; the
 * frontend enforces the exact mapping rather than maintaining its
 * own copy of the labels.
 */
const CONTROL_DISPLAY_NAMES: Record<ConversationControlState, string> = {
  ASSISTANT_ACTIVE: "Asistan aktif",
  SELLER_TAKEN_OVER: "Siz ilgileniyorsunuz",
  RETURN_REVIEW: "İade incelemesi",
  ASSISTANT_PAUSED: "Yanıtlar durduruldu",
};

const parseCapabilities = (raw: unknown): ConversationCapabilities => {
  if (!isPlainObject(raw)) throw contractError("capabilities");
  return {
    canTakeOver: readRequiredBoolean(raw, "can_take_over"),
    canResumeAssistant: readRequiredBoolean(raw, "can_resume_assistant"),
    canPauseAssistant: readRequiredBoolean(raw, "can_pause_assistant"),
    canActivateAssistant: readRequiredBoolean(raw, "can_activate_assistant"),
  };
};

const parseControlView = (raw: unknown): ConversationControlView => {
  if (!isPlainObject(raw)) throw contractError("response");
  const customerId = readRequiredPositiveInteger(raw, "customer_id");
  const controlRaw = readKey(raw, "control");
  if (!isPlainObject(controlRaw)) throw contractError("control");
  const summary = parseControlSummary(controlRaw);
  const displayName = readRequiredString(controlRaw, "display_name");
  // Cross-field invariant: the display name is the backend's own
  // mapping for the returned state; anything else means the payload
  // drifted from CONTROL_DISPLAY_NAMES.
  if (CONTROL_DISPLAY_NAMES[summary.state] !== displayName) {
    throw contractError("control_display_name_mismatch");
  }
  const capabilities = parseCapabilities(readKey(raw, "capabilities"));
  return {
    customerId,
    control: { ...summary, displayName },
    capabilities,
  };
};

export type ConversationControlMutationResult = ConversationControlView & {
  action: ConversationControlAction;
  changed: boolean;
};

const parseControlMutationResult = (
  raw: unknown,
): ConversationControlMutationResult => {
  const view = parseControlView(raw);
  if (!isPlainObject(raw)) throw contractError("response");
  const actionRaw = readKey(raw, "action");
  if (
    typeof actionRaw !== "string" ||
    !(CONVERSATION_CONTROL_ACTIONS as readonly string[]).includes(actionRaw)
  ) {
    throw contractError("action");
  }
  const changed = readRequiredBoolean(raw, "changed");
  return {
    ...view,
    action: actionRaw as ConversationControlAction,
    changed,
  };
};

/* ------------------------------------------------------------------ */
/* Fetchers (environment-neutral; caller supplies the access token)    */
/* ------------------------------------------------------------------ */

export type FetchConversationListOptions = {
  attentionOnly?: boolean;
  /** Exact backend control-state filter; omitted means no filter. */
  controlState?: ConversationControlState;
  /** 1..100; when omitted the backend default (20) applies. */
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
  cache?: RequestCache;
};

/** Fetch and parse `GET /seller/conversations`. */
export const fetchConversationList = async (
  accessToken: string,
  options?: FetchConversationListOptions,
): Promise<ConversationListPage> => {
  const qs = buildConversationListQuery(options);
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/conversations?${qs}`,
    accessToken,
    { signal: options?.signal, cache: options?.cache ?? "no-store" },
  );
  return parseConversationListPage(raw);
};

export type FetchConversationListV2Options = {
  attentionOnly?: boolean;
  /** Exact backend control-state filter; omitted means no filter. */
  controlState?: ConversationControlState;
  /** 1..100; when omitted the backend default (20) applies. */
  limit?: number;
  /** The previous page's `nextCursor`; omit for the first page. */
  cursor?: string | null;
  signal?: AbortSignal;
  cache?: RequestCache;
};

/**
 * Fetch and parse `GET /seller/conversations/v2` — the stable
 * activity-cursor (keyset) page from the conversation read model.
 * The response is exactly {items, has_more, next_cursor}.
 */
export const fetchConversationListV2 = async (
  accessToken: string,
  options?: FetchConversationListV2Options,
): Promise<ConversationListPageV2> => {
  const query = new URLSearchParams();
  query.set(
    "attention_only",
    options?.attentionOnly === true ? "true" : "false",
  );
  if (options?.controlState !== undefined) {
    query.set("control_state", options.controlState);
  }
  if (typeof options?.limit === "number") {
    query.set("limit", String(options.limit));
  }
  if (options?.cursor) {
    query.set("cursor", options.cursor);
  }
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/conversations/v2?${query.toString()}`,
    accessToken,
    { signal: options?.signal, cache: options?.cache ?? "no-store" },
  );
  return parseConversationListPageV2(raw);
};

export type FetchConversationDetailOptions = {
  /** 1..100; when omitted the backend default (50) applies. */
  messageLimit?: number;
  /** Oldest-first paging cursor from `messagePage.nextBeforeMessageId`. */
  beforeMessageId?: number;
  controlHistoryLimit?: number;
  signal?: AbortSignal;
  cache?: RequestCache;
};

/** Fetch and parse `GET /seller/conversations/{customerId}`. */
export const fetchConversationDetail = async (
  accessToken: string,
  customerId: number,
  options?: FetchConversationDetailOptions,
): Promise<ConversationDetail> => {
  const query = new URLSearchParams();
  if (typeof options?.messageLimit === "number") {
    query.set("message_limit", String(options.messageLimit));
  }
  if (typeof options?.beforeMessageId === "number") {
    query.set("before_message_id", String(options.beforeMessageId));
  }
  if (typeof options?.controlHistoryLimit === "number") {
    query.set("control_history_limit", String(options.controlHistoryLimit));
  }
  const qs = query.toString();
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/conversations/${customerId}${qs ? `?${qs}` : ""}`,
    accessToken,
    { signal: options?.signal, cache: options?.cache ?? "no-store" },
  );
  return parseConversationDetail(raw);
};

/**
 * Fetch and parse `GET /seller/conversations/{customerId}/control` —
 * the ONLY source of the control display name and capability map.
 */
export const fetchConversationControl = async (
  accessToken: string,
  customerId: number,
  options?: { signal?: AbortSignal; cache?: RequestCache },
): Promise<ConversationControlView> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/conversations/${customerId}/control`,
    accessToken,
    { signal: options?.signal, cache: options?.cache ?? "no-store" },
  );
  return parseControlView(raw);
};

/**
 * Post a control action to
 * `POST /seller/conversations/{customerId}/control`. Optimistic
 * concurrency is mandatory: `expectedVersion` must be the version the
 * seller's screen was showing. A stale version yields HTTP 409 with
 * the backend's own calm Turkish message; the caller must refresh and
 * surface that message, never retry blindly.
 */
export const mutateConversationControl = async (
  accessToken: string,
  customerId: number,
  input: {
    action: ConversationControlAction;
    expectedVersion: number;
    reasonNote?: string | null;
    signal?: AbortSignal;
  },
): Promise<ConversationControlMutationResult> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/conversations/${customerId}/control`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        action: input.action,
        expected_version: input.expectedVersion,
        reason_note: input.reasonNote ?? null,
      }),
      signal: input.signal,
      cache: "no-store",
    },
  );
  return parseControlMutationResult(raw);
};

export const CONVERSATIONS_CONTRACT_ERROR_PREFIX =
  CONVERSATIONS_CONTRACT_PREFIX;
