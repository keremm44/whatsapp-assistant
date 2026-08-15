/**
 * Presentation helpers for the seller Conversations workbench.
 *
 * Pure, environment-neutral functions. Every label here is either:
 *
 *   - backend-owned verbatim (control display names, order display
 *     statuses, return-issue display names — mirrored from the
 *     backend's own Turkish maps and documented at the site), or
 *   - an approved presentation label for a backend-defined state
 *     (the attention-reason labels from the Conversations V1 spec).
 *
 * Nothing here invents business semantics: no SLA, no waiting time,
 * no urgency, no unread counts, no invented provenance for outgoing
 * messages.
 */

import { formatTimeAgo } from "./dashboard-format.ts";
import type {
  ConversationAttentionReason,
  ConversationCapabilities,
  ConversationControlAction,
  ConversationControlHistoryEntry,
  ConversationControlState,
  ConversationCustomerSummary,
  ConversationMessage,
  ConversationOrderStatus,
  ReturnIssueType,
} from "./conversations.ts";

/* ------------------------------------------------------------------ */
/* Customer identity                                                   */
/* ------------------------------------------------------------------ */

/**
 * Restrained generic fallback used when a customer has neither a name
 * nor a WhatsApp number (both are nullable in the contract). A
 * customer row without either is practically unreachable — the
 * customer is created from the incoming WhatsApp number — but the
 * contract types allow it, so the UI needs one calm constant.
 */
export const FALLBACK_CUSTOMER_LABEL = "Müşteri";

export type ConversationCustomerDisplay = {
  /** Primary identity line: trimmed name, otherwise the number. */
  primary: string;
  /** The WhatsApp number when the primary line already shows a name. */
  secondary: string | null;
};

export const getConversationCustomerDisplay = (
  customer: Pick<
    ConversationCustomerSummary,
    "name" | "whatsappNumber"
  > | null,
): ConversationCustomerDisplay => {
  const name =
    typeof customer?.name === "string" && customer.name.trim().length > 0
      ? customer.name.trim()
      : null;
  const number =
    typeof customer?.whatsappNumber === "string" &&
    customer.whatsappNumber.trim().length > 0
      ? customer.whatsappNumber.trim()
      : null;

  if (name !== null) {
    return { primary: name, secondary: number };
  }
  if (number !== null) {
    return { primary: number, secondary: null };
  }
  return { primary: FALLBACK_CUSTOMER_LABEL, secondary: null };
};

/* ------------------------------------------------------------------ */
/* Timestamps                                                          */
/* ------------------------------------------------------------------ */

/**
 * Relative phrase for a message/last-activity timestamp.
 *
 * Reuses the dashboard's delta-based formatter: the phrase depends
 * only on (timestamp, nowMs), never on the user's clock or timezone.
 * Callers pass a frozen `renderedAt` captured at server resolution
 * time so SSR and hydration produce the identical string; rows and
 * messages fetched later in the browser pass `Date.now()`.
 *
 * The phrase describes the LAST MESSAGE time — never a waiting time,
 * never an SLA. Returns null for missing/malformed/future input so
 * the caller can omit the element entirely.
 */
export const formatConversationTimestamp = (
  iso: string | null | undefined,
  renderedAt: number,
): string | null => formatTimeAgo(iso, renderedAt);

/* ------------------------------------------------------------------ */
/* Message preview (list rows)                                         */
/* ------------------------------------------------------------------ */

/**
 * Compose the one-line preview for a conversation row. Media messages
 * surface a quiet "Medya mesajı" marker — the read model exposes
 * `media_available` only, never a URL, so nothing visual (no
 * thumbnail, no fabricated link) is ever rendered.
 */
export const describeMessagePreview = (
  message: ConversationMessage | null,
): { isMedia: boolean; text: string | null } => {
  if (!message) {
    return { isMedia: false, text: null };
  }
  const text =
    typeof message.content === "string" && message.content.trim().length > 0
      ? message.content.trim()
      : null;
  return { isMedia: message.mediaAvailable, text };
};

/**
 * The media indicator copy, shared by the list preview and the
 * message timeline bubble so the two never drift apart.
 */
export const MEDIA_MESSAGE_LABEL = "Medya mesajı";

/* ------------------------------------------------------------------ */
/* Attention presentation (list rows)                                  */
/* ------------------------------------------------------------------ */

/**
 * The one restrained attention signal for a row: small dot + short
 * label. Labels are the approved presentation mapping for
 * backend-defined attention reasons — presentation only, never new
 * business semantics.
 *
 * Tone follows the Working Ledger's colour semantics, where colour
 * describes STATE and never content type:
 *
 *   OXIDE (attention) is spent ONLY on the two reasons whose
 *   underlying record is genuinely in a seller-review state:
 *   `return_review` and `order_review`. These are the same two the
 *   dashboard flags, so the two surfaces agree.
 *
 *   `unanswered_question` is a queue item the seller can pick up, not
 *   a record awaiting review, so it stays neutral ink.
 *
 *   `seller_taken_over` is OWNERSHIP, not an alarm — it is deliberately
 *   neutral, and deliberately NOT interaction blue, because blue in
 *   this direction means selected/active/navigation and would be
 *   confused with the queue's selection state.
 *
 *   `assistant_paused` uses the truthful paused/neutral state role.
 */
export const ATTENTION_REASON_META: Record<
  ConversationAttentionReason,
  { label: string; dotClassName: string; textClassName: string }
> = {
  return_review: {
    label: "İade incelemesi",
    dotClassName: "bg-attention",
    textClassName: "text-attention",
  },
  seller_taken_over: {
    label: "Siz ilgileniyorsunuz",
    dotClassName: "bg-muted-foreground",
    textClassName: "text-muted",
  },
  assistant_paused: {
    label: "Yanıtlar durduruldu",
    dotClassName: "bg-paused",
    textClassName: "text-paused",
  },
  order_review: {
    label: "Sipariş incelemesi",
    dotClassName: "bg-attention",
    textClassName: "text-attention",
  },
  unanswered_question: {
    label: "Cevaplanamayan soru",
    dotClassName: "bg-muted-foreground",
    textClassName: "text-muted",
  },
};

/* ------------------------------------------------------------------ */
/* Control chip presentation (conversation header)                     */
/* ------------------------------------------------------------------ */

/**
 * Tonal chip per backend control state. The LABEL inside the chip is
 * never read from here — it comes from the control endpoint's
 * backend-owned `display_name`. Only the tone is a frontend concern.
 *
 * Working Ledger semantics:
 *   ASSISTANT_ACTIVE / SELLER_TAKEN_OVER are the ordinary operating
 *     states, so they stay NEUTRAL — reserving interaction blue for
 *     selection/action and oxide for review keeps both meaningful.
 *   RETURN_REVIEW is a genuine seller-review state, so it is the one
 *     control state that earns oxide.
 *   ASSISTANT_PAUSED uses the truthful paused/neutral role.
 *
 * Measured contrast on the light ledger materials:
 *   foreground  on recessed        ~11.6:1
 *   attention   on attention-soft   ~5.0:1
 *   foreground  on paused-muted    ~11.0:1
 */
export const CONTROL_STATE_CHIP_TONE: Record<
  ConversationControlState,
  { chipClassName: string; dotClassName: string }
> = {
  ASSISTANT_ACTIVE: {
    chipClassName: "bg-recessed text-foreground",
    dotClassName: "bg-muted-foreground",
  },
  SELLER_TAKEN_OVER: {
    chipClassName: "bg-recessed text-foreground",
    dotClassName: "bg-muted-foreground",
  },
  RETURN_REVIEW: {
    chipClassName: "bg-attention-soft text-attention",
    dotClassName: "bg-attention",
  },
  ASSISTANT_PAUSED: {
    chipClassName: "bg-paused-muted text-foreground",
    dotClassName: "bg-paused",
  },
};

/* ------------------------------------------------------------------ */
/* V1 handoff action                                                   */
/* ------------------------------------------------------------------ */

/**
 * The single V1 handoff action for a control state.
 *
 * The resolution is STATE-AWARE, never capability-order-dependent.
 * The locked V1 mapping is:
 *
 *   ASSISTANT_ACTIVE   -> "Ben ilgileneceğim" (take_over)
 *   RETURN_REVIEW      -> "Ben ilgileneceğim" (take_over)
 *   SELLER_TAKEN_OVER  -> "Asistana bırak"    (resume_assistant)
 *   ASSISTANT_PAUSED   -> "Asistana bırak"    (resume_assistant)
 *
 * and the backend capability is the FINAL gate on top of the state:
 * an action is returned only when the state's approved V1 action is
 * also permitted by the capability map. This matters concretely for
 * ASSISTANT_PAUSED: the backend permits BOTH can_take_over and
 * can_resume_assistant there, so a capability-priority helper would
 * incorrectly offer "Ben ilgileneceğim"; the V1 product decision is
 * that a paused conversation is handed back to the assistant.
 *
 * Deliberate V1 scope: `canPauseAssistant` and `canActivateAssistant`
 * are ignored — the panel never posts `pause_assistant` or
 * `activate_assistant`, regardless of state or capabilities.
 *
 * Returns null when the state has no approved V1 action here or when
 * the required capability is false; the caller renders no action.
 */
export type ConversationHandoff = {
  action: Extract<
    ConversationControlAction,
    "take_over" | "resume_assistant"
  >;
  label: string;
  /** Short supporting explanation of what the handoff means. */
  supporting: string;
};

const TAKE_OVER_HANDOFF: ConversationHandoff = {
  action: "take_over",
  label: "Ben ilgileneceğim",
  supporting:
    "Asistan bekler; bu konuşmanın yanıtlarını siz yönetirsiniz.",
};

const RESUME_HANDOFF: ConversationHandoff = {
  action: "resume_assistant",
  label: "Asistana bırak",
  supporting: "Asistan yeni mesajlarda yeniden devreye girer.",
};

export const resolveConversationHandoff = (
  controlState: ConversationControlState,
  capabilities: ConversationCapabilities,
): ConversationHandoff | null => {
  switch (controlState) {
    case "ASSISTANT_ACTIVE":
    case "RETURN_REVIEW":
      return capabilities.canTakeOver ? TAKE_OVER_HANDOFF : null;
    case "SELLER_TAKEN_OVER":
    case "ASSISTANT_PAUSED":
      return capabilities.canResumeAssistant ? RESUME_HANDOFF : null;
    default:
      return null;
  }
};

/* ------------------------------------------------------------------ */
/* Context-rail labels (backend-owned display strings)                 */
/* ------------------------------------------------------------------ */

/**
 * Mirror of `ISSUE_TYPE_DISPLAY_NAMES` in
 * backend/return_issue_service.py. The conversation read model
 * returns the raw issue_type enum (no display field), so the
 * frontend mirrors the backend's own canonical Turkish labels —
 * the same mapping the backend uses when it renders issue types.
 * This is the single frontend home of this map; other seller
 * surfaces must import it from here instead of duplicating it.
 */
export const RETURN_ISSUE_TYPE_LABELS: Record<ReturnIssueType, string> = {
  RETURN_REQUEST: "İade talebi",
  DAMAGED_ITEM: "Hasarlı ürün",
  WRONG_ITEM: "Yanlış ürün",
  PRINT_OR_PERSONALIZATION_ISSUE: "Baskı / kişiselleştirme sorunu",
  DELIVERY_ISSUE: "Teslimat sorunu",
  OTHER_ORDER_ISSUE: "Diğer sipariş sorunu",
};

/**
 * Mirror of `ORDER_DISPLAY_STATUS` in backend/database.py for the two
 * active statuses the read model can return. ("COMPLETE" can never
 * appear here — the SQL filters it out — so it is not in this map.)
 */
export const ORDER_STATUS_LABELS: Record<ConversationOrderStatus, string> = {
  COLLECTING: "Bilgi toplanıyor",
  SELLER_REVIEW_REQUIRED: "Satıcı incelemesi gerekiyor",
};

/* ------------------------------------------------------------------ */
/* Filter URLs                                                         */
/* ------------------------------------------------------------------ */

/**
 * The two list filters map directly onto the backend's
 * `attention_only` query parameter:
 *   "Tümü"                     -> attention_only=false (no param)
 *   "İlgilenmeniz gerekenler"  -> attention_only=true  (?filter=attention)
 */
export const conversationsListHref = (attentionOnly: boolean): string =>
  attentionOnly ? "/seller/conversations?filter=attention" : "/seller/conversations";

export const conversationDetailHref = (
  customerId: number,
  attentionOnly: boolean,
): string =>
  attentionOnly
    ? `/seller/conversations/${customerId}?filter=attention`
    : `/seller/conversations/${customerId}`;

/* ------------------------------------------------------------------ */
/* Konuşma geçmişi (control history presentation)                      */
/* ------------------------------------------------------------------ */

/**
 * Seller-facing labels for the four backend control states, used by
 * the read-only history log. Consistent with the product's existing
 * language (Paused page, control chips). Raw enum values never render.
 */
export const CONTROL_STATE_HISTORY_LABELS: Record<
  ConversationControlState,
  string
> = {
  ASSISTANT_ACTIVE: "Asistan aktif",
  SELLER_TAKEN_OVER: "Siz ilgileniyorsunuz",
  RETURN_REVIEW: "İade incelemesi",
  ASSISTANT_PAUSED: "Yanıtlar durduruldu",
};

export const CONTROL_HISTORY_TITLE = "Konuşma geçmişi";

/** Compact by default; expansion is frontend-only over loaded data. */
export const CONTROL_HISTORY_INITIAL_COUNT = 5;
/**
 * Deliberately NOT "Tüm geçmişi göster": the backend detail returns a
 * bounded history collection, so the frontend never implies it holds
 * the complete lifetime history.
 */
export const CONTROL_HISTORY_SHOW_MORE_LABEL = "Daha fazlasını göster";
export const CONTROL_HISTORY_SHOW_LESS_LABEL = "Daha az göster";

export type ControlHistoryEntryDisplay = {
  /** "Asistan aktif → Siz ilgileniyorsunuz" — plain text, SR-readable. */
  transition: string;
  /** Seller-written reason, trimmed for presence; null when absent. */
  note: string | null;
};

/**
 * The ONLY seller-facing projection of a control-history entry: the
 * state transition plus the optional human reason note. The pick is
 * deliberately narrow — reasonCode, changedByProfileId, message ids
 * and version fields are technical and can never leak through this
 * helper. No actor identity is inferred or fabricated (the contract
 * carries no verified actor name), and no reason is invented when the
 * note is absent.
 */
export const getControlHistoryEntryDisplay = (
  entry: Pick<
    ConversationControlHistoryEntry,
    "fromState" | "toState" | "reasonNote"
  >,
): ControlHistoryEntryDisplay => {
  const note =
    typeof entry.reasonNote === "string" && entry.reasonNote.trim().length > 0
      ? entry.reasonNote.trim()
      : null;
  return {
    transition: `${CONTROL_STATE_HISTORY_LABELS[entry.fromState]} → ${CONTROL_STATE_HISTORY_LABELS[entry.toState]}`,
    note,
  };
};

/* ------------------------------------------------------------------ */
/* Context presence (rail / Bağlam sheet visibility)                   */
/* ------------------------------------------------------------------ */

/**
 * Whether the detail payload carries any conversation context worth a
 * rail/sheet: an active order, an active return/issue, one or more
 * open unanswered questions — or a non-empty control history (the
 * read-only Konuşma geçmişi is valid context on its own; the rail
 * must not disappear when history is the only content).
 */
export const hasConversationContext = (detail: {
  activeOrder: unknown | null;
  activeReturnIssue: unknown | null;
  openUnanswered: unknown[];
  controlHistory: unknown[];
}): boolean =>
  detail.activeOrder !== null ||
  detail.activeReturnIssue !== null ||
  detail.openUnanswered.length > 0 ||
  detail.controlHistory.length > 0;
