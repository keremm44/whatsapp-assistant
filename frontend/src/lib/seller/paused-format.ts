/**
 * Presentation helpers for the Seller “Yanıtı Durdurulanlar” queue.
 *
 * Pure and environment-neutral. The page is a read-only recognition
 * list, not a second Conversations workbench: it never invents control
 * actions, AI summaries, or extra business states. The one operational
 * transition remains opening the existing conversation.
 */

/**
 * Locked page-level state phrase. The page title/description already
 * say responses are paused, so rows do NOT repeat this as a state
 * chip; it remains the accessible-name fallback and the reason line
 * when the backend supplied no recognizable reason code.
 */
export const PAUSED_STATE_LABEL = "Yanıtlar durduruldu";

/** Visible CTA — the only action on this surface. */
export const PAUSED_OPEN_CONVERSATION_LABEL = "Konuşmayı aç";

/**
 * Backend active-order context is surfaced asymmetrically: rows with
 * an active order get a quiet recognition signal; rows without one
 * stay visually calm instead of repeating a noisy “Sipariş yok”.
 */
export const PAUSED_ACTIVE_ORDER_LABEL = "Sipariş var";

/**
 * Backend-owned reason codes that have an approved seller-facing
 * label. Any other / future code falls back to the generic state
 * line and is never shown raw.
 */
export const PAUSED_REASON_LABELS = {
  manual_pause: "Sizin tarafınızdan durduruldu",
  security: "Güvenlik nedeniyle durduruldu",
  violation: "Müşteri davranışı nedeniyle durduruldu",
} as const;

export type PausedReasonCode = keyof typeof PAUSED_REASON_LABELS;

export const getPausedReasonLabel = (
  reasonCode: string | null | undefined,
): string | null => {
  if (reasonCode === "manual_pause") return PAUSED_REASON_LABELS.manual_pause;
  if (reasonCode === "security") return PAUSED_REASON_LABELS.security;
  if (reasonCode === "violation") return PAUSED_REASON_LABELS.violation;
  return null;
};

/* ------------------------------------------------------------------ */
/* Reason-first presentation                                           */
/* ------------------------------------------------------------------ */

/**
 * The row's primary scan concept: WHY the assistant is not replying.
 *
 * `kind` drives restrained visual differentiation only (a small line
 * icon — never alarm colors; security is a state, not an emergency).
 * `label` is always a seller-facing sentence; raw backend codes never
 * surface — an unrecognized/missing code collapses to the generic
 * paused phrase, which in that case is the only truthful information.
 */
export type PausedReasonKind =
  | "seller"
  | "security"
  | "violation"
  | "unknown";

export type PausedReasonPresentation = {
  kind: PausedReasonKind;
  label: string;
};

export const getPausedReasonPresentation = (
  reasonCode: string | null | undefined,
): PausedReasonPresentation => {
  if (reasonCode === "manual_pause") {
    return { kind: "seller", label: PAUSED_REASON_LABELS.manual_pause };
  }
  if (reasonCode === "security") {
    return { kind: "security", label: PAUSED_REASON_LABELS.security };
  }
  if (reasonCode === "violation") {
    return { kind: "violation", label: PAUSED_REASON_LABELS.violation };
  }
  return { kind: "unknown", label: PAUSED_STATE_LABEL };
};

/**
 * Quiet secondary note. Shown only when the backend stored a
 * non-empty note that is not the same sentence as the mapped
 * reason label.
 */
export const getPausedReasonNote = (
  reasonNote: string | null | undefined,
  reasonLabel: string | null,
): string | null => {
  if (typeof reasonNote !== "string") return null;
  const trimmed = reasonNote.trim();
  if (trimmed.length === 0) return null;
  if (reasonLabel !== null && trimmed === reasonLabel) return null;
  return trimmed;
};

/** Destination is the existing Conversations workbench. */
export const pausedConversationHref = (customerId: number): string =>
  `/seller/conversations/${customerId}`;

export const PAUSED_EMPTY_COPY = {
  title: "Yanıtı durdurulan konuşma yok",
  description:
    "Asistanın yanıtlarının durdurulduğu bir konuşma olduğunda burada görünecek.",
} as const;

export const PAUSED_UNAVAILABLE_COPY = {
  title: "Yanıtı durdurulan konuşmalar yüklenemedi.",
  description: "Bağlantı kurulamadı. Tekrar deneyebilirsiniz.",
} as const;
