/**
 * Conversations context destination tests.
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/seller/conversations-destinations.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  conversationOrderDestination,
  conversationReturnDestination,
  conversationUnansweredDestination,
} from "./conversations-destinations.ts";

test("non-action return context opens the collecting view on the exact request", () => {
  assert.equal(
    conversationReturnDestination({
      id: 41,
      sellerActionRequired: false,
    }),
    "/seller/returns?view=collecting&request=41",
  );
});

test("seller-action return context uses the canonical action-required URL", () => {
  assert.equal(
    conversationReturnDestination({
      id: 41,
      sellerActionRequired: true,
    }),
    "/seller/returns?request=41",
  );
});

test("unanswered context opens the exact question group", () => {
  assert.equal(
    conversationUnansweredDestination({ id: 17 }),
    "/seller/unanswered?question=17",
  );
});

test("non-action order opens collecting on the exact selected order", () => {
  assert.equal(
    conversationOrderDestination({
      id: 18,
      sellerActionRequired: false,
    }),
    "/seller/orders?view=collecting&order=18",
  );
});

test("seller-action order opens action-required on the exact selected order", () => {
  assert.equal(
    conversationOrderDestination({
      id: 18,
      sellerActionRequired: true,
    }),
    "/seller/orders?view=action_required&order=18",
  );
});

test("order context uses the existing query selection, never an invented detail route", () => {
  const href = conversationOrderDestination({
    id: 18,
    sellerActionRequired: true,
  });
  assert.equal(href.includes("/seller/orders/"), false);
  assert.equal(href.includes("order=18"), true);
});
