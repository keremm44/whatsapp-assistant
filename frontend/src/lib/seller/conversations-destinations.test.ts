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

test("return context opens the exact return request", () => {
  assert.equal(
    conversationReturnDestination({ id: 41 }),
    "/seller/returns?request=41",
  );
});

test("unanswered context opens the exact question group", () => {
  assert.equal(
    conversationUnansweredDestination({ id: 17 }),
    "/seller/unanswered?question=17",
  );
});

test("order context uses the exact Orders search when a number is present", () => {
  assert.equal(
    conversationOrderDestination({ externalOrderNumber: "TR123456" }),
    "/seller/orders?q=TR123456",
  );
});

test("order context falls back to the Orders list when the number is absent", () => {
  assert.equal(
    conversationOrderDestination({ externalOrderNumber: null }),
    "/seller/orders",
  );
  assert.equal(
    conversationOrderDestination({ externalOrderNumber: "   " }),
    "/seller/orders",
  );
});

test("order context never invents an order detail route", () => {
  const href = conversationOrderDestination({ externalOrderNumber: "TR9" });
  assert.equal(href.includes("/seller/orders/"), false);
});
