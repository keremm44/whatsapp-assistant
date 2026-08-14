/**
 * Global assistant status — derived STRICTLY from the real
 * `GET /seller/me` access block (`aiEnabled`, `onboardingCompleted`,
 * `systemStatus`). No new backend semantics are invented here.
 *
 * The mapping is informed by the backend's auto-reply gate,
 * `chat_service.seller_lifecycle_block`, which blocks automatic
 * replies (messages are still recorded) and checks, in order:
 * emergency pause, ai_enabled, onboarding_completed, then
 * system_status ∉ {"active", "beta_active"}.
 *
 * IMPORTANT LIMIT: this module computes ONLY from the three fields
 * the `/seller/me` access contract actually exposes. The backend's
 * `emergency_paused` state is NOT exposed there, so the frontend
 * deliberately has no notice kind for it — the notice can therefore
 * lag behind the full backend gate, and it never claims to be an
 * exact mirror. For the three exposed fields the check order below
 * matches the backend's, so the notice names the same first blocking
 * condition among them:
 *
 *   1. aiEnabled is not true           → "ai_disabled"
 *   2. onboardingCompleted not true    → "onboarding_incomplete"
 *   3. systemStatus not in
 *      {"active", "beta_active"}       → "inactive_status"
 *
 * When none of these hold, the assistant is operational as far as
 * /seller/me can tell and the shell shows NOTHING — no green badge,
 * no "her şey yolunda" chrome. The notice exists only for genuinely
 * non-normal backend states.
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
  // Same check order as the backend gate uses for these three
  // exposed fields, so among them the notice names the same first
  // blocking condition. (emergency_paused is not exposed on
  // /seller/me and is intentionally not represented here.)
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
