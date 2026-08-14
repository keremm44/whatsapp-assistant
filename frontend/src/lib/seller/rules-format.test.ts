/**
 * Presentation tests for Seller Rules.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyRulesMutationFailure,
  RULE_CONFLICT_MESSAGE,
  RULE_DUPLICATE_MESSAGE,
  RULE_RESPONSE_LABEL,
  RULE_TRIGGER_LABEL,
  RULES_CREATE_DIALOG_TITLE,
  RULES_CREATE_LABEL,
  RULES_EDIT_DIALOG_TITLE,
  RULES_PAGE_DESCRIPTION,
  RULES_PAGE_TITLE,
  getRuleHitCountLabel,
  isRuleDuplicateConflict,
  normalizeRuleViewParam,
  RULE_DEACTIVATE_EXPLANATION,
  RULE_MATCHING_HELP,
  RULES_UNAVAILABLE_DESCRIPTION,
  RULES_UNAVAILABLE_TITLE,
  rulesListEmptyCopy,
  rulesWorkspaceHref,
} from "./rules-format.ts";

test("view params map to the three backend filters", () => {
  assert.equal(normalizeRuleViewParam(undefined), "active");
  assert.equal(normalizeRuleViewParam("inactive"), "inactive");
  assert.equal(normalizeRuleViewParam("all"), "all");
  assert.equal(normalizeRuleViewParam("pending"), "active");
  assert.equal(rulesWorkspaceHref("active"), "/seller/rules");
  assert.equal(rulesWorkspaceHref("inactive"), "/seller/rules?view=inactive");
  assert.equal(rulesWorkspaceHref("all"), "/seller/rules?view=all");
});

test("hit_count presentation is factual, not conversion", () => {
  assert.equal(getRuleHitCountLabel(0), "Henüz kullanılmadı");
  assert.equal(getRuleHitCountLabel(3), "3 kez kullanıldı");
});

test("empty states are distinct from unavailable", () => {
  assert.equal(rulesListEmptyCopy("active").title, "Henüz etkin cevap yok");
  assert.equal(rulesListEmptyCopy("inactive").title, "Devre dışı cevap yok");
  assert.equal(
    rulesListEmptyCopy("all").title,
    "Henüz mesaja göre cevap eklenmemiş",
  );
  assert.notEqual(RULES_UNAVAILABLE_TITLE, rulesListEmptyCopy("all").title);
  assert.match(RULES_UNAVAILABLE_DESCRIPTION, /boş değil/i);
});

test("matching copy does not promise AI / fuzzy / training", () => {
  assert.match(RULE_MATCHING_HELP, /bu ifade geçtiğinde/);
  assert.doesNotMatch(RULE_MATCHING_HELP, /anlamsal|fuzzy|öğren|eğitim|AI/i);
});

test("deactivation is not deletion", () => {
  assert.match(RULE_DEACTIVATE_EXPLANATION, /yeni müşteri mesajlarında kullanılmayacak/);
  assert.doesNotMatch(RULE_DEACTIVATE_EXPLANATION, /Sil|silin/);
});

test("classifies mutation statuses and duplicate conflict", () => {
  assert.equal(classifyRulesMutationFailure(409), "conflict");
  assert.equal(classifyRulesMutationFailure(422), "validation");
  assert.equal(classifyRulesMutationFailure(500), "retryable");
  assert.equal(
    isRuleDuplicateConflict({
      detail: { code: "seller_rule_duplicate", message: "..." },
    }),
    true,
  );
});

test("Rules UI never uses Sil or AI-training wording", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sources = [
    readFileSync(path.resolve(dir, "../../app/seller/rules/page.tsx"), "utf8"),
    readFileSync(
      path.resolve(dir, "../../components/seller/rules/rules-workspace.tsx"),
      "utf8",
    ),
    readFileSync(
      path.resolve(dir, "../../components/seller/rules/rule-dialogs.tsx"),
      "utf8",
    ),
  ].join("\n");
  assert.doesNotMatch(sources, /["']Sil["']/);
  assert.doesNotMatch(sources, /fuzzy|anlamsal|öğrenir|eğitim/i);
});

/* ------------------------------------------------------------------ */
/* Seller-facing product language: Mesaja Göre Cevaplar                */
/* ------------------------------------------------------------------ */

test("seller-facing language is cevap-based, never rule-engine wording", () => {
  assert.equal(RULES_PAGE_TITLE, "Mesaja Göre Cevaplar");
  assert.equal(
    RULES_PAGE_DESCRIPTION,
    "Müşterinin mesajında belirli bir ifade geçtiğinde asistanın ne cevap vereceğini belirleyin.",
  );
  assert.equal(RULES_CREATE_LABEL, "Yeni cevap ekle");
  assert.equal(RULES_CREATE_DIALOG_TITLE, "Mesaja göre cevap ekle");
  assert.equal(RULES_EDIT_DIALOG_TITLE, "Cevabı düzenle");
  // Cause → response mental model.
  assert.equal(RULE_TRIGGER_LABEL, "Müşteri mesajında geçerse");
  assert.equal(RULE_RESPONSE_LABEL, "Asistan şöyle cevap verir");
  // No seller-visible "kural" left in the approved copy set.
  const sellerCopy = [
    RULES_PAGE_TITLE,
    RULES_PAGE_DESCRIPTION,
    RULES_CREATE_LABEL,
    RULES_CREATE_DIALOG_TITLE,
    RULES_EDIT_DIALOG_TITLE,
    RULE_TRIGGER_LABEL,
    RULE_RESPONSE_LABEL,
    RULE_MATCHING_HELP,
    RULE_DEACTIVATE_EXPLANATION,
    RULE_CONFLICT_MESSAGE,
    RULE_DUPLICATE_MESSAGE,
    RULES_UNAVAILABLE_TITLE,
    rulesListEmptyCopy("active").title,
    rulesListEmptyCopy("inactive").title,
    rulesListEmptyCopy("all").title,
  ].join(" ");
  assert.doesNotMatch(sellerCopy, /kural/i);
});
