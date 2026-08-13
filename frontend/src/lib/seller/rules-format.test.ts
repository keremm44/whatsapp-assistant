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
  assert.equal(rulesListEmptyCopy("active").title, "Henüz etkin kural yok");
  assert.equal(rulesListEmptyCopy("inactive").title, "Devre dışı kural yok");
  assert.equal(rulesListEmptyCopy("all").title, "Henüz kural eklenmemiş");
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
