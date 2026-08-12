/**
 * Presentation helpers for the Seller “Yanıtı Durdurulanlar” queue.
 *
 * Pure and environment-neutral. The page is a recognition list, not a
 * second Conversations workbench: it never invents control actions,
 * AI summaries, or extra business states.
 */

/** Locked state line for every paused row. */
export const PAUSED_STATE_LABEL = "Yanıtlar durduruldu";

/** Visible CTA — the only action on this surface. */
export const PAUSED_OPEN_CONVERSATION_LABEL = "Konuşmayı aç";

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
