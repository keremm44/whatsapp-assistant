/**
 * Offset-pagination mitigation tests (`offset-pagination.ts`).
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/seller/offset-pagination.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cancelInflightLoadMore,
  decideOffsetPageAdvance,
  OFFSET_PAGE_AUTO_CONTINUE_CAP,
  ownsLoadMoreLifecycle,
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

/* ------------------------------------------------------------------ */
/* Load-more lifecycle: stale-context cancellation                     */
/* ------------------------------------------------------------------ */

test("context replacement aborts the in-flight request and reopens the gate", () => {
  const controller = new AbortController();
  const inflight = { current: controller as AbortController | null };

  // Filter/search/tab change or refresh → new bootstrap → cancel.
  cancelInflightLoadMore(inflight);

  // The old request is signalled: every await-point check in the
  // request body (`if (controller.signal.aborted) return;`) now bails,
  // so a late response cannot append rows / move offset / set errors.
  assert.equal(controller.signal.aborted, true);
  // The single-in-flight gate is open again for the new context.
  assert.equal(inflight.current, null);
});

test("cancelling with no in-flight request is a safe no-op", () => {
  const inflight = { current: null };
  cancelInflightLoadMore(inflight);
  assert.equal(inflight.current, null);
});

test("only the owning request may finalize shared lifecycle state", () => {
  const first = new AbortController();
  const inflight = { current: first as AbortController | null };

  // Normal completion: the ref still holds this controller.
  assert.equal(ownsLoadMoreLifecycle(inflight, first), true);

  // Cancelled by a context change: the ref was cleared — the old
  // request's finally must NOT touch loading/controller state.
  cancelInflightLoadMore(inflight);
  assert.equal(ownsLoadMoreLifecycle(inflight, first), false);

  // A new request can start after the old one was aborted…
  const second = new AbortController();
  inflight.current = second;
  assert.equal(ownsLoadMoreLifecycle(inflight, second), true);
  // …and the stale first request still owns nothing: its finally can
  // never stomp the newer request's loading/controller state.
  assert.equal(ownsLoadMoreLifecycle(inflight, first), false);
  assert.equal(second.signal.aborted, false);
});

test("stale completion after re-seed cannot mutate the new list state", () => {
  // Deterministic simulation of the panels' shared flow, with the
  // same guards the components use around every state write.
  const inflight = { current: null as AbortController | null };
  let rows = ["a1", "a2"];
  let isLoadingMore = false;

  // Old-context load-more starts.
  const stale = new AbortController();
  inflight.current = stale;
  isLoadingMore = true;

  // Context changes: bootstrap re-seed cancels + resets, exactly like
  // the panels' bootstrap effect.
  cancelInflightLoadMore(inflight);
  isLoadingMore = false;
  rows = ["b1"]; // re-seeded from the new first page

  // The stale request's response finally lands.
  if (!stale.signal.aborted) {
    rows = [...rows, "a3"]; // would be the stale append
  }
  if (ownsLoadMoreLifecycle(inflight, stale)) {
    inflight.current = null;
    isLoadingMore = false;
  }

  assert.deepEqual(rows, ["b1"]);
  assert.equal(isLoadingMore, false);
  assert.equal(inflight.current, null);
});
