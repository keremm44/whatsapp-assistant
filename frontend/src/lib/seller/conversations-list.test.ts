/**
 * Conversation list query / control-state filter tests.
 *
 * Runs with Node's built-in test runner:
 *   node --test src/lib/seller/conversations-list.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildConversationListQuery,
  parseConversationControlStateFilter,
} from "./conversations-query.ts";

test("unfiltered list query stays identical to the previous contract", () => {
  assert.equal(buildConversationListQuery(), "attention_only=false");
  assert.equal(
    buildConversationListQuery({ attentionOnly: false }),
    "attention_only=false",
  );
  assert.equal(
    buildConversationListQuery({ attentionOnly: true, offset: 20 }),
    "attention_only=true&offset=20",
  );
  assert.equal(buildConversationListQuery().includes("control_state"), false);
});

test("paused queue requests the exact ASSISTANT_PAUSED filter", () => {
  assert.equal(
    buildConversationListQuery({ controlState: "ASSISTANT_PAUSED" }),
    "attention_only=false&control_state=ASSISTANT_PAUSED",
  );
});

test("parser accepts omitted or null control_state as no filter", () => {
  assert.equal(parseConversationControlStateFilter(undefined), null);
  assert.equal(parseConversationControlStateFilter(null), null);
});

test("parser accepts a filtered ASSISTANT_PAUSED echo", () => {
  assert.equal(
    parseConversationControlStateFilter("ASSISTANT_PAUSED"),
    "ASSISTANT_PAUSED",
  );
});

test("parser rejects an unknown echoed control_state", () => {
  assert.throws(
    () => parseConversationControlStateFilter("MUTED"),
    /conversations_invalid_control_state/,
  );
});

test("flow-state allowlist accepts AWAITING_ORDER_PRODUCT as soft_lock", () => {
  const source = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "conversations.ts"),
    "utf8",
  );
  assert.match(source, /"AWAITING_ORDER_PRODUCT"/);
  assert.match(source, /AWAITING_ORDER_PRODUCT:\s*"soft_lock"/);
  assert.doesNotMatch(
    source,
    /AWAITING_ORDER_PRODUCT:\s*"(?:no_lock|informational)"/,
  );
});

test("paused page asks the backend for ASSISTANT_PAUSED instead of client-filtering", () => {
  const page = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../app/seller/paused/page.tsx",
    ),
    "utf8",
  );
  assert.match(page, /controlState:\s*"ASSISTANT_PAUSED"/);
  assert.doesNotMatch(page, /ASSISTANT_ACTIVE|SELLER_TAKEN_OVER|RETURN_REVIEW/);
});
