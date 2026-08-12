/**
 * Dashboard QuietSummary model tests (`dashboard-summary.ts`).
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/seller/dashboard-summary.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDashboardQuietSummary } from "./dashboard-summary.ts";

const high = { priority: "high" as const };
const normal = { priority: "normal" as const };

test("a complete page may show the priority breakdown", () => {
  const model = buildDashboardQuietSummary({
    tasks: [high, high, normal],
    total: 3,
  });
  assert.deepEqual(model, {
    kind: "complete",
    high: 2,
    normal: 1,
    total: 3,
  });
  if (model.kind === "complete") {
    assert.equal(model.high + model.normal, model.total);
  }
});

test("an empty complete page stays at zero with no negative counts", () => {
  const model = buildDashboardQuietSummary({ tasks: [], total: 0 });
  assert.deepEqual(model, {
    kind: "complete",
    high: 0,
    normal: 0,
    total: 0,
  });
});

test("a partial page does not pretend fetched priority counts are global", () => {
  const tasks = Array.from({ length: 50 }, (_, index) =>
    index < 37 ? high : normal,
  );
  const model = buildDashboardQuietSummary({ tasks, total: 73 });
  assert.deepEqual(model, { kind: "partial", shown: 50, total: 73 });
});

test("total greater than 50 with a full first page is partial", () => {
  const tasks = Array.from({ length: 50 }, () => high);
  const model = buildDashboardQuietSummary({ tasks, total: 51 });
  assert.equal(model.kind, "partial");
  if (model.kind === "partial") {
    assert.equal(model.shown, 50);
    assert.equal(model.total, 51);
  }
});

test("shown and total are never negative", () => {
  const model = buildDashboardQuietSummary({ tasks: [], total: -4 });
  assert.equal(model.kind, "complete");
  if (model.kind === "complete") {
    assert.ok(model.high >= 0);
    assert.ok(model.normal >= 0);
    assert.ok(model.total >= 0);
  }
});

test("an inconsistent extra page is not treated as a global priority split", () => {
  const model = buildDashboardQuietSummary({
    tasks: Array.from({ length: 51 }, () => high),
    total: 50,
  });
  assert.deepEqual(model, { kind: "partial", shown: 51, total: 50 });
});
