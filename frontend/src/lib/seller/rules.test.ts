/**
 * Contract tests for Seller Rules.
 *
 *   node --test src/lib/seller/rules.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCreateRulePayload,
  buildEditRulePayload,
  buildReactivateRulePayload,
  parseRuleDeactivateResponse,
  parseRuleListResponse,
  parseRuleMutationResponse,
  RULES_CONTRACT_ERROR_PREFIX,
} from "./rules.ts";
import { activeQueryForView } from "./rules-format.ts";

const rawRule = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 7,
  trigger_text: "toplu sipariş",
  response_text: "Bu talebi satıcıya iletiyorum.",
  category: "custom",
  is_active: true,
  hit_count: 4,
  version: 2,
  created_at: "2026-08-10T12:00:00+00:00",
  updated_at: "2026-08-10T12:05:00+00:00",
  ...overrides,
});

test("parses a valid rule list", () => {
  const page = parseRuleListResponse({ rules: [rawRule(), rawRule({ id: 8, is_active: false, hit_count: 0 })] });
  assert.equal(page.rules.length, 2);
  assert.equal(page.rules[0]?.triggerText, "toplu sipariş");
  assert.equal(page.rules[0]?.hitCount, 4);
  assert.equal(page.rules[1]?.isActive, false);
});

test("rejects a malformed rule payload", () => {
  const bad: unknown[] = [
    "nope",
    { rules: {} },
    { rules: [rawRule({ id: 0 })] },
    { rules: [rawRule({ trigger_text: 1 })] },
    { rules: [rawRule({ hit_count: -1 })] },
    { rules: [rawRule({ is_active: "yes" })] },
    { rules: [rawRule({ version: 0 })] },
  ];
  for (const payload of bad) {
    assert.throws(
      () => parseRuleListResponse(payload),
      (error: unknown) =>
        error instanceof Error &&
        error.message.startsWith(RULES_CONTRACT_ERROR_PREFIX),
    );
  }
});

test("view mapping matches backend active query", () => {
  assert.equal(activeQueryForView("active"), true);
  assert.equal(activeQueryForView("inactive"), false);
  assert.equal(activeQueryForView("all"), undefined);
});

test("create payload omits category and is_active so backend defaults apply", () => {
  const payload = buildCreateRulePayload({
    triggerText: "  toplu sipariş  ",
    responseText: "  Satıcıya iletiyorum.  ",
  });
  assert.deepEqual(payload, {
    trigger_text: "toplu sipariş",
    response_text: "Satıcıya iletiyorum.",
  });
  assert.equal("category" in payload, false);
  assert.equal("is_active" in payload, false);
});

test("edit payload sends expected_version and does not touch category or is_active", () => {
  const payload = buildEditRulePayload({
    version: 2,
    triggerText: "kargo",
    responseText: "Yarın çıkar.",
  });
  assert.deepEqual(payload, {
    expected_version: 2,
    trigger_text: "kargo",
    response_text: "Yarın çıkar.",
  });
  assert.equal("category" in payload, false);
  assert.equal("is_active" in payload, false);
});

test("reactivate payload is PATCH is_active true with version", () => {
  assert.deepEqual(buildReactivateRulePayload(5), {
    expected_version: 5,
    is_active: true,
  });
});

test("deactivate helper encodes expected_version on the DELETE query", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, resolve } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "rules-api.ts"),
    "utf8",
  );
  assert.match(source, /method:\s*"DELETE"/);
  assert.match(source, /expected_version/);
});

test("parses create and deactivate envelopes", () => {
  const created = parseRuleMutationResponse({ rule: rawRule({ version: 1 }) });
  assert.equal(created.rule.version, 1);
  const deactivated = parseRuleDeactivateResponse({
    changed: true,
    rule: rawRule({ is_active: false, version: 3 }),
  });
  assert.equal(deactivated.changed, true);
  assert.equal(deactivated.rule.isActive, false);
});
