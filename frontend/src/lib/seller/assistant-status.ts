/**
 * Global assistant status — derived STRICTLY from the real
 * `GET /seller/me` access block (`aiEnabled`, `onboardingCompleted`,
 * `systemStatus`). No new backend semantics are invented here.
 *
 * The decision mirrors the backend's own auto-reply gate,
 * `chat_service.seller_lifecycle_block`, which blocks automatic
 * replies (messages are still recorded) in this exact precedence:
 *
 *   1. ai_enabled is not True          → "ai_disabled"
 *   2. onboarding_completed not True   → "onboarding_incomplete"
 *   3. system_status not in
 *      {"active", "beta_active"}       → "inactive_status"
 *
 * When none of these hold, the assistant is operational and the shell
 * shows NOTHING — no green badge, no "her şey yolunda" chrome. The
 * notice exists only for genuinely non-normal backend states.
 *
 * No CTA is offered anywhere: the current backend exposes no
 * seller-panel endpoint to re-enable AI, complete onboarding, or
 * change system_status, so every notice is calm and informational.
 * The exact meaning of individual non-active system_status values
 * (e.g. admin_review_pending vs automatic_validation) is not
 * seller-actionable in the contract, so they intentionally share the
 * backend's own generic "not open for live use" meaning instead of
 * invented per-state stories.
 */

import type { SellerAccess } from "./me";

/** The backend's operational statuses (chat_service.ACTIVE_SELLER_STATUSES). */
export const OPERATIONAL_SYSTEM_STATUSES = [
  "active",
  "beta_active",
] as const;

export type AssistantStatusNoticeKind =
  | "ai_disabled"
  | "onboarding_incomplete"
  | "inactive_status";

export type AssistantStatusNotice = {
  kind: AssistantStatusNoticeKind;
  title: string;
  description: string;
};

/**
 * Shared truthful headline: in every blocked state the backend
 * records incoming messages but produces no automatic reply
 * ("mesaj kaydedilir ancak cevap üretilmez").
 */
export const ASSISTANT_NOTICE_TITLE = "Asistan otomatik yanıt vermiyor";

export const ASSISTANT_NOTICE_DESCRIPTIONS: Record<
  AssistantStatusNoticeKind,
  string
> = {
  ai_disabled:
    "Asistan bu işletme için şu anda etkin değil. Müşteri mesajları kaydedilir ancak otomatik yanıt gönderilmez.",
  onboarding_incomplete:
    "İşletme kurulumu henüz tamamlanmadı. Kurulum tamamlanana kadar müşteri mesajları kaydedilir ancak otomatik yanıt gönderilmez.",
  inactive_status:
    "İşletme hesabı şu anda canlı kullanıma açık değil. Müşteri mesajları kaydedilir ancak otomatik yanıt gönderilmez.",
};

/**
 * Compute the shell's assistant status notice. Returns null in the
 * normal operational state — the shell must then render no status
 * surface at all.
 */
export const getAssistantStatusNotice = (
  access: Pick<
    SellerAccess,
    "aiEnabled" | "onboardingCompleted" | "systemStatus"
  >,
): AssistantStatusNotice | null => {
  // Same precedence as chat_service.seller_lifecycle_block, so the
  // notice always names the condition the backend actually blocks on
  // first.
  if (access.aiEnabled !== true) {
    return {
      kind: "ai_disabled",
      title: ASSISTANT_NOTICE_TITLE,
      description: ASSISTANT_NOTICE_DESCRIPTIONS.ai_disabled,
    };
  }
  if (access.onboardingCompleted !== true) {
    return {
      kind: "onboarding_incomplete",
      title: ASSISTANT_NOTICE_TITLE,
      description: ASSISTANT_NOTICE_DESCRIPTIONS.onboarding_incomplete,
    };
  }
  if (
    !(OPERATIONAL_SYSTEM_STATUSES as readonly string[]).includes(
      access.systemStatus,
    )
  ) {
    return {
      kind: "inactive_status",
      title: ASSISTANT_NOTICE_TITLE,
      description: ASSISTANT_NOTICE_DESCRIPTIONS.inactive_status,
    };
  }
  return null;
};
