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
  buildPausedListFreshnessSignature,
  SELLER_FRESHNESS_COPY,
  SELLER_FRESHNESS_INTERVAL_MS,
  signaturesDiffer,
} from "./freshness.ts";

const task = (overrides: {
  id?: string;
  entityVersion?: number;
  updatedAt?: string;
} = {}) => ({
  id: overrides.id ?? "return_review:41",
  entityVersion: overrides.entityVersion ?? 2,
  updatedAt: overrides.updatedAt ?? "2026-08-10T12:05:00+00:00",
});

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

test("dashboard signatures include the explicit global total", () => {
  const signature = buildDashboardFreshnessSignature({
    total: 50,
    tasks: [task()],
  });
  assert.equal(
    signature,
    "total:50|tasks:return_review:41:2:2026-08-10T12:05:00+00:00",
  );
  assert.match(signature, /^total:50\|tasks:/);
});

test("dashboard signature is stable when tasks and total stay the same", () => {
  const first = buildDashboardFreshnessSignature({
    total: 50,
    tasks: [task(), task({ id: "order_review:9", entityVersion: 4 })],
  });
  const second = buildDashboardFreshnessSignature({
    total: 50,
    tasks: [task(), task({ id: "order_review:9", entityVersion: 4 })],
  });
  assert.equal(signaturesDiffer(first, second), false);
});

test("dashboard signature moves when only the global total changes", () => {
  const tasks = [task()];
  assert.equal(
    signaturesDiffer(
      buildDashboardFreshnessSignature({ total: 50, tasks }),
      buildDashboardFreshnessSignature({ total: 51, tasks }),
    ),
    true,
  );
});

test("dashboard signature moves when a task version changes", () => {
  assert.equal(
    signaturesDiffer(
      buildDashboardFreshnessSignature({ total: 1, tasks: [task()] }),
      buildDashboardFreshnessSignature({
        total: 1,
        tasks: [task({ entityVersion: 3 })],
      }),
    ),
    true,
  );
});

test("dashboard signature moves when a task updatedAt changes", () => {
  assert.equal(
    signaturesDiffer(
      buildDashboardFreshnessSignature({ total: 1, tasks: [task()] }),
      buildDashboardFreshnessSignature({
        total: 1,
        tasks: [task({ updatedAt: "2026-08-10T12:06:00+00:00" })],
      }),
    ),
    true,
  );
});

test("dashboard signature moves when backend task order changes", () => {
  const a = task({ id: "return_review:41" });
  const b = task({ id: "order_review:9" });
  assert.equal(
    signaturesDiffer(
      buildDashboardFreshnessSignature({ total: 2, tasks: [a, b] }),
      buildDashboardFreshnessSignature({ total: 2, tasks: [b, a] }),
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

test("paused freshness includes the global total and first-page identity", () => {
  const row = {
    customer: { id: 22 },
    lastMessage: { id: 90 },
    control: { version: 4 },
    needsAttention: true,
    attentionReason: "assistant_paused",
  };
  const first = buildPausedListFreshnessSignature({
    total: 20,
    conversations: [row],
  });
  assert.equal(first, "total:20|rows:22:90:4:1:assistant_paused");
  assert.equal(
    signaturesDiffer(
      first,
      buildPausedListFreshnessSignature({ total: 21, conversations: [row] }),
    ),
    true,
  );
  assert.equal(
    signaturesDiffer(
      first,
      buildPausedListFreshnessSignature({ total: 20, conversations: [row] }),
    ),
    false,
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

test("paused list panel mounts one freshness notice and requests ASSISTANT_PAUSED", () => {
  const source = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../components/seller/paused/paused-list-panel.tsx",
    ),
    "utf8",
  );
  const constructions = source.match(/<SellerFreshnessNotice\b/g) ?? [];
  assert.equal(constructions.length, 1);
  const mounts = source.match(/\{freshness\}/g) ?? [];
  assert.equal(mounts.length, 2);
  assert.match(source, /controlState:\s*PAUSED_CONTROL_STATE/);
  assert.match(source, /ASSISTANT_PAUSED/);
  assert.equal(source.includes("filter((row) => row.control"), false);
});
