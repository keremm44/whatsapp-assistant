/**
 * Contract tests for the Orders list parser (`orders.ts`).
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/seller/orders.test.ts
 * (via `npm test`)
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ORDERS_CONTRACT_ERROR_PREFIX,
  parseOrdersListResponse,
  type OrderSummary,
} from "./orders.ts";

const rawSummary = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 7,
  external_order_number: "TR123456",
  product_id: null,
  product_name_snapshot: "Kişiye Özel Kupa",
  customer_id: 22,
  customer_phone_snapshot: "+905321112233",
  status: "COLLECTING",
  display_status: "Bilgi toplanıyor",
  image_message_id: null,
  has_image: false,
  custom_text: null,
  review_reason_code: null,
  review_reason_note: null,
  version: 3,
  created_at: "2026-08-10T12:00:00+00:00",
  updated_at: "2026-08-10T12:05:00+00:00",
  completed_at: null,
  seller_action_required: false,
  ...overrides,
});

const rawListPage = (
  orders: Record<string, unknown>[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  view: "all",
  toplam: orders.length,
  limit: 20,
  offset: 0,
  orders,
  ...overrides,
});

test("parses a complete order summary including the print-content fields", () => {
  const page = parseOrdersListResponse(
    rawListPage([
      rawSummary({
        external_order_number: "TR987654",
        image_message_id: 104,
        has_image: true,
        custom_text: "İyi ki doğdun Kerem",
        status: "COMPLETE",
        display_status: "Bilgiler tamamlandı",
        completed_at: "2026-08-10T13:00:00+00:00",
      }),
    ]),
  );

  assert.equal(page.view, "all");
  assert.equal(page.total, 1);
  assert.equal(page.limit, 20);
  assert.equal(page.offset, 0);

  const order = page.orders[0] as OrderSummary;
  assert.equal(order.externalOrderNumber, "TR987654");
  assert.equal(order.imageMessageId, 104);
  assert.equal(order.hasImage, true);
  // custom_text must arrive byte-exact — no trimming/case folding.
  assert.equal(order.customText, "İyi ki doğdun Kerem");
  assert.equal(order.status, "COMPLETE");
  assert.equal(order.displayStatus, "Bilgiler tamamlandı");
  assert.equal(order.sellerActionRequired, false);
});

test("preserves whitespace-sensitive custom_text exactly", () => {
  const page = parseOrdersListResponse(
    rawListPage([rawSummary({ custom_text: "  Elif & Mert\n2016 " })]),
  );
  assert.equal(page.orders[0]?.customText, "  Elif & Mert\n2016 ");
});

test("parses collecting orders with pending number and missing content", () => {
  const page = parseOrdersListResponse(
    rawListPage([
      rawSummary({
        external_order_number: null,
        image_message_id: null,
        has_image: false,
        custom_text: null,
      }),
    ]),
  );
  const order = page.orders[0] as OrderSummary;
  assert.equal(order.externalOrderNumber, null);
  assert.equal(order.hasImage, false);
  assert.equal(order.customText, null);
});

test("parses review rows with the backend note", () => {
  const page = parseOrdersListResponse(
    rawListPage([
      rawSummary({
        status: "SELLER_REVIEW_REQUIRED",
        display_status: "Satıcı incelemesi gerekiyor",
        seller_action_required: true,
        review_reason_code: "product_changed",
        review_reason_note: "Ürün baskı tipi değişti.",
      }),
    ]),
    );
  const order = page.orders[0] as OrderSummary;
  assert.equal(order.sellerActionRequired, true);
  assert.equal(order.reviewReasonNote, "Ürün baskı tipi değişti.");
});

test("accepts every approved view and backend status", () => {
  for (const view of ["all", "collecting", "action_required"] as const) {
    assert.equal(parseOrdersListResponse(rawListPage([], { view })).view, view);
  }
  for (const status of ["COLLECTING", "COMPLETE", "SELLER_REVIEW_REQUIRED"]) {
    const page = parseOrdersListResponse(rawListPage([rawSummary({ status })]));
    assert.equal(page.orders[0]?.status, status);
  }
});

test("enforces the has_image <-> image_message_id invariant", () => {
  assert.throws(
    () =>
      parseOrdersListResponse(
        rawListPage([rawSummary({ has_image: true, image_message_id: null })]),
      ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === `${ORDERS_CONTRACT_ERROR_PREFIX}has_image_mismatch`,
  );
  assert.throws(
    () =>
      parseOrdersListResponse(
        rawListPage([rawSummary({ has_image: false, image_message_id: 55 })]),
      ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === `${ORDERS_CONTRACT_ERROR_PREFIX}has_image_mismatch`,
  );
});

test("rejects drifted payloads with contract errors", () => {
  const bad: Array<[string, unknown]> = [
    ["non-object page", "nope"],
    ["unknown view", rawListPage([], { view: "hazir" })],
    ["unknown status", rawListPage([rawSummary({ status: "SHIPPED" })])],
    ["missing toplam", { view: "all", limit: 20, offset: 0, orders: [] }],
    ["limit out of range", rawListPage([], { limit: 0 })],
    ["limit out of range high", rawListPage([], { limit: 101 })],
    ["negative offset", rawListPage([], { offset: -1 })],
    ["orders not array", rawListPage([], { orders: {} })],
    ["custom_text wrong type", rawListPage([rawSummary({ custom_text: 5 })])],
    ["id not positive", rawListPage([rawSummary({ id: 0 })])],
    [
      "image_message_id not positive",
      rawListPage([rawSummary({ image_message_id: -3, has_image: true })]),
    ],
  ];

  for (const [name, payload] of bad) {
    assert.throws(
      () => parseOrdersListResponse(payload),
      (error: unknown) =>
        error instanceof Error &&
        error.message.startsWith(ORDERS_CONTRACT_ERROR_PREFIX),
      name,
    );
  }
});

test("keeps backend ordering verbatim (no client re-sort)", () => {
  const page = parseOrdersListResponse(
    rawListPage([
      rawSummary({ id: 9, external_order_number: "B" }),
      rawSummary({ id: 3, external_order_number: "A" }),
      rawSummary({ id: 5, external_order_number: "C" }),
    ]),
  );
  assert.deepEqual(
    page.orders.map((order) => order.id),
    [9, 3, 5],
  );
});
