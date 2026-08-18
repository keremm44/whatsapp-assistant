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
  parseOrderDetailResponse,
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
  assert.equal(page.pageCount, 1);
  assert.equal(page.limit, 20);
  assert.equal(page.offset, 0);

  const order = page.orders[0] as OrderSummary;
  assert.equal(order.externalOrderNumber, "TR987654");
  assert.equal(order.imageMessageId, 104);
  assert.equal(order.hasImage, true);
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

test("toplam mirrors the returned page length — it is not a global total", () => {
  const full = parseOrdersListResponse(
    rawListPage(
      Array.from({ length: 20 }, (_, index) => rawSummary({ id: index + 1 })),
      { toplam: 20, offset: 0 },
    ),
  );
  assert.equal(full.pageCount, 20);
  assert.equal(full.orders.length, 20);

  const short = parseOrdersListResponse(
    rawListPage([rawSummary()], { toplam: 1, offset: 20 }),
  );
  assert.equal(short.pageCount, 1);
  assert.equal(short.offset, 20);
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

const rawDetailOrder = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 41,
  external_order_number: "TR123456",
  product_id: 3,
  product_name_snapshot: "Kişiye Özel Kupa",
  customer_id: 22,
  customer_phone_snapshot: "+905321112233",
  customer_note: "Hediye paketi olsun lütfen",
  image_message_id: 104,
  custom_text: "İyi ki doğdun Deniz",
  status: "COMPLETE",
  display_status: "Bilgiler tamamlandı",
  review_reason_code: null,
  review_reason_note: null,
  created_from_message_id: 900,
  last_source_message_id: 950,
  version: 4,
  created_at: "2026-08-10T12:00:00+00:00",
  updated_at: "2026-08-10T12:30:00+00:00",
  completed_at: "2026-08-10T12:30:00+00:00",
  closed_at: null,
  seller_action_required: false,
  ...overrides,
});

const rawDetailField = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 11,
  source_definition_id: 5,
  definition_version: 2,
  field_key: "kupa_rengi",
  label: "Kupa rengi",
  field_type: "single_choice",
  is_required: true,
  sort_order: 0,
  options: [{ value: "white", label: "Beyaz" }],
  validation_config: {},
  value: "white",
  source_message_id: 940,
  completed: true,
  ...overrides,
});

test("parses a full detail: order block + dynamic-field snapshot values", () => {
  const detail = parseOrderDetailResponse({
    order: rawDetailOrder(),
    fields: [
      rawDetailField(),
      rawDetailField({
        id: 12,
        field_key: "isim",
        label: "Üzerine yazılacak isim",
        field_type: "short_text",
        sort_order: 1,
        options: [],
        value: "Deniz",
      }),
      rawDetailField({
        id: 13,
        field_key: "adet",
        label: "Adet",
        field_type: "number",
        sort_order: 2,
        options: [],
        value: 2,
      }),
      rawDetailField({
        id: 14,
        field_key: "renkler",
        label: "Renkler",
        field_type: "multi_choice",
        sort_order: 3,
        options: [
          { value: "white", label: "Beyaz" },
          { value: "black", label: "Siyah" },
        ],
        value: ["white", "black"],
      }),
      rawDetailField({
        id: 15,
        field_key: "hediye",
        label: "Hediye paketi",
        field_type: "boolean",
        sort_order: 4,
        options: [],
        value: true,
      }),
      rawDetailField({
        id: 16,
        field_key: "gorsel",
        label: "Baskı görseli",
        field_type: "image",
        sort_order: 5,
        options: [],
        value: { message_id: 970 },
      }),
    ],
  });

  assert.equal(detail.order.id, 41);
  assert.equal(detail.order.customerNote, "Hediye paketi olsun lütfen");
  assert.equal(detail.order.customText, "İyi ki doğdun Deniz");
  assert.equal(detail.order.closedAt, null);
  assert.equal(detail.order.sellerActionRequired, false);

  assert.equal(detail.fields.length, 6);
  assert.deepEqual(detail.fields[0]!.value, {
    kind: "single_choice",
    value: "white",
  });
  assert.deepEqual(detail.fields[0]!.options, [
    { value: "white", label: "Beyaz" },
  ]);
  assert.deepEqual(detail.fields[1]!.value, { kind: "text", text: "Deniz" });
  assert.deepEqual(detail.fields[2]!.value, { kind: "number", value: 2 });
  assert.deepEqual(detail.fields[3]!.value, {
    kind: "multi_choice",
    values: ["white", "black"],
  });
  assert.deepEqual(detail.fields[4]!.value, { kind: "boolean", value: true });
  assert.deepEqual(detail.fields[5]!.value, { kind: "image", messageId: 970 });
});

test("order detail primary-action flag is backend-owned and strict", () => {
  const review = parseOrderDetailResponse({
    order: rawDetailOrder({
      status: "SELLER_REVIEW_REQUIRED",
      display_status: "Satıcı incelemesi gerekiyor",
      seller_action_required: true,
    }),
    fields: [],
  });
  assert.equal(review.order.sellerActionRequired, true);

  assert.throws(
    () =>
      parseOrderDetailResponse({
        order: rawDetailOrder({ seller_action_required: "true" }),
        fields: [],
      }),
    new RegExp(`^Error: ${ORDERS_CONTRACT_ERROR_PREFIX}`),
  );
});

test("keeps backend field ordering verbatim and preserves pending fields", () => {
  const detail = parseOrderDetailResponse({
    order: rawDetailOrder({
      status: "COLLECTING",
      display_status: "Bilgi toplanıyor",
      completed_at: null,
    }),
    fields: [
      rawDetailField({ id: 21, sort_order: 2 }),
      rawDetailField({
        id: 22,
        field_key: "isim",
        field_type: "short_text",
        sort_order: 0,
        options: [],
        value: null,
        completed: false,
      }),
    ],
  });
  assert.deepEqual(
    detail.fields.map((field) => field.id),
    [21, 22],
  );
  assert.equal(detail.fields[1]!.completed, false);
  assert.equal(detail.fields[1]!.value, null);
});

test("image field values carry only the safe message reference", () => {
  assert.throws(
    () =>
      parseOrderDetailResponse({
        order: rawDetailOrder(),
        fields: [
          rawDetailField({
            field_type: "image",
            value: { url: "https://cdn.example/leak.jpg" },
          }),
        ],
      }),
    new RegExp(`^Error: ${ORDERS_CONTRACT_ERROR_PREFIX}`),
  );
});

test("detail contract drifts fail closed", () => {
  assert.throws(
    () =>
      parseOrderDetailResponse({
        order: rawDetailOrder(),
        fields: [rawDetailField({ value: null, completed: true })],
      }),
    new RegExp(`^Error: ${ORDERS_CONTRACT_ERROR_PREFIX}`),
  );
  assert.throws(
    () =>
      parseOrderDetailResponse({
        order: rawDetailOrder(),
        fields: [rawDetailField({ field_type: "file_upload" })],
      }),
    new RegExp(`^Error: ${ORDERS_CONTRACT_ERROR_PREFIX}`),
  );
  assert.throws(
    () =>
      parseOrderDetailResponse({
        order: rawDetailOrder(),
        fields: [rawDetailField({ field_type: "number", value: "iki" })],
      }),
    new RegExp(`^Error: ${ORDERS_CONTRACT_ERROR_PREFIX}`),
  );
  assert.throws(
    () => parseOrderDetailResponse({ fields: [] }),
    new RegExp(`^Error: ${ORDERS_CONTRACT_ERROR_PREFIX}`),
  );
});

test("customer note and custom text arrive byte-exact in the detail", () => {
  const detail = parseOrderDetailResponse({
    order: rawDetailOrder({
      customer_note: "  iki satır\nnot  ",
      custom_text: "  Deniz ❤️  ",
    }),
    fields: [],
  });
  assert.equal(detail.order.customerNote, "  iki satır\nnot  ");
  assert.equal(detail.order.customText, "  Deniz ❤️  ");
});
