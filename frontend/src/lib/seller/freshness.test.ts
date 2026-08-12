/**
 * Freshness signature tests (`freshness.ts`).
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/seller/freshness.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildConversationListFreshnessSignature,
  buildDashboardFreshnessSignature,
  buildIdVersionSignature,
  SELLER_FRESHNESS_COPY,
  SELLER_FRESHNESS_INTERVAL_MS,
  signaturesDiffer,
} from "./freshness.ts";

test("the interval is conservative (45–60s) and the copy is locked", () => {
  assert.ok(SELLER_FRESHNESS_INTERVAL_MS >= 45_000);
  assert.ok(SELLER_FRESHNESS_INTERVAL_MS <= 60_000);
  assert.equal(SELLER_FRESHNESS_COPY.message, "Yeni bilgiler var");
  assert.equal(SELLER_FRESHNESS_COPY.action, "Yenile");
});

test("id+version signatures match only when identity and version match", () => {
  const first = buildIdVersionSignature([
    { id: 1, version: 3 },
    { id: 2, version: 1 },
  ]);
  assert.equal(first, "1:3,2:1");
  assert.equal(
    signaturesDiffer(
      first,
      buildIdVersionSignature([
        { id: 1, version: 3 },
        { id: 2, version: 1 },
      ]),
    ),
    false,
  );
  assert.equal(
    signaturesDiffer(first, buildIdVersionSignature([{ id: 1, version: 4 }])),
    true,
  );
  assert.equal(signaturesDiffer(first, buildIdVersionSignature([])), true);
});

test("an empty first page has a stable empty signature", () => {
  assert.equal(buildIdVersionSignature([]), "");
  assert.equal(signaturesDiffer("", ""), false);
});

test("dashboard signatures include id, entity version and updated_at", () => {
  const signature = buildDashboardFreshnessSignature([
    {
      id: "return_review:41",
      entityVersion: 2,
      updatedAt: "2026-08-10T12:05:00+00:00",
    },
  ]);
  assert.equal(
    signature,
    "return_review:41:2:2026-08-10T12:05:00+00:00",
  );
  assert.equal(
    signaturesDiffer(
      signature,
      buildDashboardFreshnessSignature([
        {
          id: "return_review:41",
          entityVersion: 3,
          updatedAt: "2026-08-10T12:05:00+00:00",
        },
      ]),
    ),
    true,
  );
});

test("conversation signatures move when last message, control or attention changes", () => {
  const row = {
    customer: { id: 22 },
    lastMessage: { id: 90 },
    control: { version: 4 },
    needsAttention: true,
    attentionReason: "order_review",
  };
  const first = buildConversationListFreshnessSignature([row]);
  assert.equal(first, "22:90:4:1:order_review");
  assert.equal(
    signaturesDiffer(
      first,
      buildConversationListFreshnessSignature([
        { ...row, lastMessage: { id: 91 } },
      ]),
    ),
    true,
  );
  assert.equal(
    signaturesDiffer(
      first,
      buildConversationListFreshnessSignature([
        { ...row, needsAttention: false, attentionReason: null },
      ]),
    ),
    true,
  );
});

test("orders list panel mounts one freshness notice per surface", () => {
  const source = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../components/seller/orders/orders-list-panel.tsx",
    ),
    "utf8",
  );
  const constructions = source.match(/<SellerFreshnessNotice\b/g) ?? [];
  assert.equal(constructions.length, 1);
  const mounts = source.match(/\{freshness\}/g) ?? [];
  // Empty-state surface + non-empty surface — never two on the same branch.
  assert.equal(mounts.length, 2);
});
