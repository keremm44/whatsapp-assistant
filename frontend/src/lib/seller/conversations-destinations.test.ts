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

test("COLLECTING return context opens the collecting view on the exact request", () => {
  assert.equal(
    conversationReturnDestination({ id: 41, status: "COLLECTING" }),
    "/seller/returns?view=collecting&request=41",
  );
});

test("SELLER_REVIEW_REQUIRED return context uses the canonical action-required URL", () => {
  assert.equal(
    conversationReturnDestination({
      id: 41,
      status: "SELLER_REVIEW_REQUIRED",
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

test("COLLECTING order with a number opens the collecting queue search", () => {
  assert.equal(
    conversationOrderDestination({
      status: "COLLECTING",
      externalOrderNumber: "TR123456",
    }),
    "/seller/orders?view=collecting&q=TR123456",
  );
});

test("COLLECTING order without a number opens the collecting queue", () => {
  assert.equal(
    conversationOrderDestination({
      status: "COLLECTING",
      externalOrderNumber: null,
    }),
    "/seller/orders?view=collecting",
  );
  assert.equal(
    conversationOrderDestination({
      status: "COLLECTING",
      externalOrderNumber: "   ",
    }),
    "/seller/orders?view=collecting",
  );
});

test("SELLER_REVIEW_REQUIRED order with a number opens the action-required search", () => {
  assert.equal(
    conversationOrderDestination({
      status: "SELLER_REVIEW_REQUIRED",
      externalOrderNumber: "TR123456",
    }),
    "/seller/orders?view=action_required&q=TR123456",
  );
});

test("SELLER_REVIEW_REQUIRED order without a number opens the action-required queue", () => {
  assert.equal(
    conversationOrderDestination({
      status: "SELLER_REVIEW_REQUIRED",
      externalOrderNumber: null,
    }),
    "/seller/orders?view=action_required",
  );
});

test("order context never invents an order detail route", () => {
  const href = conversationOrderDestination({
    status: "SELLER_REVIEW_REQUIRED",
    externalOrderNumber: "TR9",
  });
  assert.equal(href.includes("/seller/orders/"), false);
});
