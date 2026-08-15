/**
 * Presentation helpers for Seller Rules.
 *
 * Seller-facing product language: "Mesaja Göre Cevaplar". The seller
 * mental model is a simple cause → response pair (müşteri mesajında
 * geçerse → asistan şöyle cevap verir), never a rule/automation
 * engine. Internal names, the /seller/rules route and the backend
 * Rule contract stay unchanged — this is product language only, and
 * matching semantics are untouched.
 */

import type { RuleView, SellerRule } from "./rules.ts";

export const RULES_PAGE_CAPTION = "Asistan Ayarları";
export const RULES_PAGE_TITLE = "Mesaja Göre Cevaplar";
export const RULES_PAGE_DESCRIPTION =
  "Müşterinin mesajında belirli bir ifade geçtiğinde asistanın ne cevap vereceğini belirleyin.";

export const RULES_BACK_LABEL = "← Asistan Ayarları";
export const RULES_BACK_HREF = "/seller/assistant-settings";

/** Primary CTA (short form). */
export const RULES_CREATE_LABEL = "Yeni cevap ekle";
/** Longer, more natural dialog title for the same action. */
export const RULES_CREATE_DIALOG_TITLE = "Mesaja göre cevap ekle";
export const RULES_EDIT_DIALOG_TITLE = "Cevabı düzenle";
export const RULES_DEACTIVATE_LABEL = "Devre dışı bırak";
export const RULES_REACTIVATE_LABEL = "Yeniden etkinleştir";

export const RULE_TRIGGER_LABEL = "Müşteri mesajında geçerse";
export const RULE_RESPONSE_LABEL = "Asistan şöyle cevap verir";
export const RULE_TRIGGER_HEADING = "Müşteri mesajında geçerse";
export const RULE_RESPONSE_HEADING = "Asistan şöyle cevap verir";

export const RULE_MATCHING_HELP =
  "Asistan, müşteri mesajında bu ifade geçtiğinde kayıtlı cevabı kullanabilir.";

export const RULE_DEACTIVATE_EXPLANATION =
  "Bu cevap yeni müşteri mesajlarında kullanılmayacak. Geçmiş konuşmalar değişmez.";

export const RULE_CONFLICT_MESSAGE =
  "Bu cevap başka bir işlemde değişmiş. Güncel halini kontrol edip tekrar deneyin.";

export const RULE_DUPLICATE_MESSAGE =
  "Aynı ifadeyi kullanan etkin bir cevap zaten var.";

export const RULES_UNAVAILABLE_TITLE =
  "Mesaja göre cevaplar şu anda yüklenemedi.";
export const RULES_UNAVAILABLE_DESCRIPTION =
  "Bağlantı kurulamadı. Liste boş değil; lütfen tekrar deneyin.";

export const DEFAULT_RULE_VIEW: RuleView = "active";

export type RuleViewTab = { view: RuleView; label: string };

export const RULE_VIEW_TABS: readonly RuleViewTab[] = [
  { view: "active", label: "Aktif" },
  { view: "inactive", label: "Devre dışı" },
  { view: "all", label: "Tümü" },
];

export const normalizeRuleViewParam = (
  value: string | string[] | undefined,
): RuleView => {
  const single = Array.isArray(value) ? value[0] : value;
  if (single === "inactive" || single === "all" || single === "active") {
    return single;
  }
  return DEFAULT_RULE_VIEW;
};

export const rulesWorkspaceHref = (view: RuleView): string => {
  if (view === DEFAULT_RULE_VIEW) return "/seller/rules";
  return `/seller/rules?view=${view}`;
};

export const getRuleStatusLabel = (isActive: boolean): string =>
  isActive ? "Aktif" : "Devre dışı";

/**
 * Semantic tone for a rule's active/inactive state.
 *
 * "Aktif" is the NORMAL OPERATING STATE, not an achievement: the rule
 * is simply live for new customer messages. It therefore renders in
 * neutral foreground ink. Success green is reserved for truthful
 * terminal completion (COMPLETE / ANSWERED / HANDLED); spending it on
 * every enabled record would drain the colour of meaning.
 *
 * "Devre dışı" is deliberately disabled, which is exactly what the
 * paused role means.
 *
 * Interaction cyan is never used here — being active is a business
 * state, not an interaction. The LABEL always comes from
 * `getRuleStatusLabel`, so status is never communicated by colour
 * alone.
 */
export type RuleStatusTone = "neutral" | "paused";

export const getRuleStatusTone = (isActive: boolean): RuleStatusTone =>
  isActive ? "neutral" : "paused";

export const getRuleHitCountLabel = (hitCount: number): string =>
  hitCount === 0 ? "Henüz kullanılmadı" : `${hitCount} kez kullanıldı`;

export const rulesListEmptyCopy = (
  view: RuleView,
): { title: string; description: string | null } => {
  if (view === "active") {
    return {
      title: "Henüz etkin cevap yok",
      description:
        "Tekrarlanan müşteri mesajları için bir cevap ekleyebilirsiniz.",
    };
  }
  if (view === "inactive") {
    return { title: "Devre dışı cevap yok", description: null };
  }
  return {
    title: "Henüz mesaja göre cevap eklenmemiş",
    description: null,
  };
};

export const classifyRulesMutationFailure = (
  status: number | null,
): "conflict" | "validation" | "not_found" | "auth" | "retryable" => {
  if (status === 401) return "auth";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "validation";
  return "retryable";
};

export const readNestedErrorCode = (body: unknown): string | null => {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.code === "string" && record.code) return record.code;
  const detail = record.detail;
  if (typeof detail === "object" && detail !== null) {
    const nested = (detail as Record<string, unknown>).code;
    if (typeof nested === "string" && nested) return nested;
  }
  return null;
};

export const isRuleDuplicateConflict = (body: unknown): boolean =>
  readNestedErrorCode(body) === "seller_rule_duplicate";

export const activeQueryForView = (
  view: RuleView,
): boolean | undefined => {
  if (view === "active") return true;
  if (view === "inactive") return false;
  return undefined;
};

export const RULES_FORBIDDEN_COPY = [
  "Sil",
  "anlamsal",
  "fuzzy",
  "eğitim",
  "öğrenir",
] as const;

export const ruleHasForbiddenCopy = (text: string): boolean =>
  RULES_FORBIDDEN_COPY.some((word) => text.includes(word));

export const sortRulesForDisplay = (rules: readonly SellerRule[]): SellerRule[] =>
  [...rules];
