import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countForSellerHref,
  formatSidebarCount,
  parseSellerSidebarSummary,
} from "./sidebar-summary.ts";

test("parses the backend sidebar summary contract", () => {
  const summary = parseSellerSidebarSummary({
    returns_action_required: 4,
    unanswered_open: 7,
    paused_or_taken_over: 2,
  });

  assert.deepEqual(summary, {
    returnsActionRequired: 4,
    unansweredOpen: 7,
    pausedOrTakenOver: 2,
  });
  assert.equal(countForSellerHref(summary, "/seller/returns"), 4);
  assert.equal(countForSellerHref(summary, "/seller/unanswered"), 7);
  assert.equal(countForSellerHref(summary, "/seller/paused"), 2);
  assert.equal(countForSellerHref(summary, "/seller/orders"), null);
});

test("invalid or negative counts fail closed instead of becoming zero", () => {
  assert.throws(
    () =>
      parseSellerSidebarSummary({
        returns_action_required: -1,
        unanswered_open: 0,
        paused_or_taken_over: 0,
      }),
    /sidebar_summary_invalid_returns_action_required/,
  );
});

test("large counts use a compact stable badge label", () => {
  assert.equal(formatSidebarCount(0), "0");
  assert.equal(formatSidebarCount(99), "99");
  assert.equal(formatSidebarCount(100), "99+");
});
