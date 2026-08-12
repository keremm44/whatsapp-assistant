/**
 * Offset-pagination mitigation tests (`offset-pagination.ts`).
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/seller/offset-pagination.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decideOffsetPageAdvance,
  OFFSET_PAGE_AUTO_CONTINUE_CAP,
} from "./offset-pagination.ts";

const pageSize = (overrides: {
  incomingCount: number;
  appendedCount: number;
  incomingOffset?: number;
  autoContinueCount?: number;
}) =>
  decideOffsetPageAdvance({
    incomingCount: overrides.incomingCount,
    appendedCount: overrides.appendedCount,
    incomingOffset: overrides.incomingOffset ?? 20,
    pageSize: 20,
    autoContinueCount: overrides.autoContinueCount ?? 0,
    moreRule: { kind: "page_size" },
  });

const globalTotal = (overrides: {
  incomingCount: number;
  appendedCount: number;
  loadedCount: number;
  total: number;
  incomingOffset?: number;
  autoContinueCount?: number;
}) =>
  decideOffsetPageAdvance({
    incomingCount: overrides.incomingCount,
    appendedCount: overrides.appendedCount,
    incomingOffset: overrides.incomingOffset ?? 20,
    pageSize: 20,
    autoContinueCount: overrides.autoContinueCount ?? 0,
    moreRule: {
      kind: "global_total",
      loadedCount: overrides.loadedCount,
      total: overrides.total,
    },
  });

/* ------------------------------------------------------------------ */
/* Page-size rule (Orders / Returns / Unanswered)                      */
/* ------------------------------------------------------------------ */

test("0 / 1 / 19 rows end pagination; 20 rows may continue", () => {
  assert.deepEqual(pageSize({ incomingCount: 0, appendedCount: 0, incomingOffset: 0 }), {
    nextOffset: 0,
    moreAvailable: false,
    shouldAutoContinue: false,
  });
  assert.equal(pageSize({ incomingCount: 1, appendedCount: 1 }).moreAvailable, false);
  assert.equal(pageSize({ incomingCount: 19, appendedCount: 19 }).moreAvailable, false);
  assert.equal(pageSize({ incomingCount: 20, appendedCount: 20 }).moreAvailable, true);
});

test("exactly 20 / 40 / 41: a full page never hides later work", () => {
  // First page of 20: more may exist (the previous bug treated this as done).
  assert.equal(
    pageSize({ incomingCount: 20, appendedCount: 20, incomingOffset: 0 }).moreAvailable,
    true,
  );
  // Second full page (40 items seen): still may continue.
  assert.equal(
    pageSize({ incomingCount: 20, appendedCount: 20, incomingOffset: 20 }).moreAvailable,
    true,
  );
  // Final short page after 40 (the 41st row): end.
  assert.equal(
    pageSize({ incomingCount: 1, appendedCount: 1, incomingOffset: 40 }).moreAvailable,
    false,
  );
});

test("a final empty page after an exact multiple of page size ends the queue", () => {
  const decision = pageSize({
    incomingCount: 0,
    appendedCount: 0,
    incomingOffset: 40,
  });
  assert.equal(decision.moreAvailable, false);
  assert.equal(decision.shouldAutoContinue, false);
  assert.equal(decision.nextOffset, 40);
});

test("a full page of only duplicates advances and auto-continues under the cap", () => {
  const decision = pageSize({
    incomingCount: 20,
    appendedCount: 0,
    incomingOffset: 20,
    autoContinueCount: 0,
  });
  assert.equal(decision.moreAvailable, true);
  assert.equal(decision.shouldAutoContinue, true);
  assert.equal(decision.nextOffset, 40);
});

test("auto-continue is capped so a pathological page cannot loop forever", () => {
  const atCap = pageSize({
    incomingCount: 20,
    appendedCount: 0,
    incomingOffset: 60,
    autoContinueCount: OFFSET_PAGE_AUTO_CONTINUE_CAP,
  });
  assert.equal(atCap.moreAvailable, true);
  assert.equal(atCap.shouldAutoContinue, false);
  assert.equal(atCap.nextOffset, 80);
});

test("a short page of only duplicates ends the page-size queue", () => {
  const decision = pageSize({
    incomingCount: 3,
    appendedCount: 0,
    incomingOffset: 20,
  });
  assert.equal(decision.moreAvailable, false);
  assert.equal(decision.shouldAutoContinue, false);
});

/* ------------------------------------------------------------------ */
/* Global-total rule (Conversations)                                   */
/* ------------------------------------------------------------------ */

test("global-total lists continue while loaded < total, even on a full unique page", () => {
  const decision = globalTotal({
    incomingCount: 20,
    appendedCount: 20,
    loadedCount: 40,
    total: 41,
    incomingOffset: 20,
  });
  assert.equal(decision.moreAvailable, true);
  assert.equal(decision.shouldAutoContinue, false);
});

test("global-total lists stop when loaded catches the reported total", () => {
  const decision = globalTotal({
    incomingCount: 1,
    appendedCount: 1,
    loadedCount: 41,
    total: 41,
    incomingOffset: 40,
  });
  assert.equal(decision.moreAvailable, false);
  assert.equal(decision.shouldAutoContinue, false);
});

test("global-total duplicate pages auto-continue while more rows are reported", () => {
  const decision = globalTotal({
    incomingCount: 20,
    appendedCount: 0,
    loadedCount: 20,
    total: 41,
    incomingOffset: 20,
  });
  assert.equal(decision.moreAvailable, true);
  assert.equal(decision.shouldAutoContinue, true);
  assert.equal(decision.nextOffset, 40);
});

test("an empty page stops even if the reported total still looks higher", () => {
  // Queue movement can empty a later offset; looping would be unbounded.
  const decision = globalTotal({
    incomingCount: 0,
    appendedCount: 0,
    loadedCount: 20,
    total: 41,
    incomingOffset: 20,
  });
  assert.equal(decision.moreAvailable, false);
  assert.equal(decision.shouldAutoContinue, false);
});
