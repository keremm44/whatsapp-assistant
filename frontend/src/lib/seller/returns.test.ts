/**
 * Contract tests for the İade ve Sorunlar parsers (`returns.ts`).
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/seller/returns.test.ts
 * (via `npm test`)
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseMarkReturnHandledResponse,
  parseReturnDetailResponse,
  parseReturnIssueSettingsList,
  parseReturnIssueSettingUpdate,
  parseReturnListResponse,
  RETURNS_CONTRACT_ERROR_PREFIX,
} from "./returns.ts";

/* ------------------------------------------------------------------ */
/* Raw fixtures (backend response shapes, verbatim key names)          */
/* ------------------------------------------------------------------ */

const rawRequest = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 41,
  seller_id: 3,
  customer_id: 22,
  order_id: 18,
  issue_type: "RETURN_REQUEST",
  external_order_number_snapshot: "TR123456",
  product_name_snapshot: "Kişiye Özel Kupa",
  reason_text: "Ürün kırık geldi, iade etmek istiyorum.",
  image_requirement_snapshot: "REQUIRED",
  status: "SELLER_REVIEW_REQUIRED",
  review_reason_code: "COLLECTION_COMPLETE",
  review_note: "Tüm zorunlu bilgiler alındı.",
  created_from_message_id: 900,
  last_source_message_id: 980,
  version: 3,
  created_at: "2026-08-10T12:00:00+00:00",
  updated_at: "2026-08-10T12:05:00+00:00",
  review_required_at: "2026-08-10T12:05:00+00:00",
  handled_at: null,
  handled_by_profile_id: null,
  seller_note: null,
  ...overrides,
});

const rawListRow = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ...rawRequest(),
  display_issue_type: "İade talebi",
  customer_phone: "+905321112233",
  seller_action_required: true,
  ...overrides,
});

const rawListResponse = (
  requests: Record<string, unknown>[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  view: "action_required",
  toplam: requests.length,
  limit: 20,
  offset: 0,
  requests,
  ...overrides,
});

/** List response containing exactly one customized row. */
const rawListRowShape = (
  row: Record<string, unknown>,
): Record<string, unknown> => rawListResponse([rawListRow(row)]);

const rawDetail = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  request: {
    ...rawRequest(),
    display_issue_type: "İade talebi",
    seller_action_required: true,
  },
  customer: {
    id: 22,
    seller_id: 3,
    whatsapp_number: "+905321112233",
    name: "Elif Yılmaz",
  },
  order: {
    id: 18,
    external_order_number: "TR123456",
    product_name_snapshot: "Kişiye Özel Kupa",
    status: "COLLECTING",
    version: 5,
  },
  evidence: [
    {
      id: 71,
      seller_id: 3,
      request_id: 41,
      message_id: 980,
      created_at: "2026-08-10T12:04:00+00:00",
    },
  ],
  missing_fields: [],
  ...overrides,
});

/* ------------------------------------------------------------------ */
/* List envelope + rows                                                */
/* ------------------------------------------------------------------ */

test("parses a complete list row with the backend display fields", () => {
  const page = parseReturnListResponse(
    rawListResponse([
      rawListRow({ customer_phone: "+90 532 111 22 33" }),
    ]),
  );

  assert.equal(page.view, "action_required");
  assert.equal(page.pageCount, 1);
  assert.equal(page.limit, 20);
  assert.equal(page.offset, 0);

  const row = page.requests[0];
  assert.equal(row?.id, 41);
  assert.equal(row?.displayIssueType, "İade talebi");
  // The phone is the stored value, verbatim — never reformatted.
  assert.equal(row?.customerPhone, "+90 532 111 22 33");
  assert.equal(row?.sellerActionRequired, true);
  // The customer's reason arrives byte-exact — never rewritten.
  assert.equal(row?.reasonText, "Ürün kırık geldi, iade etmek istiyorum.");
  assert.equal(row?.imageRequirementSnapshot, "REQUIRED");
});

test("each canonical backend view parses through unchanged", () => {
  for (const view of ["action_required", "collecting", "handled", "all"]) {
    const page = parseReturnListResponse(rawListResponse([], { view }));
    assert.equal(page.view, view);
  }
});

test("rejects an unknown view instead of coercing it", () => {
  assert.throws(
    () => parseReturnListResponse(rawListResponse([], { view: "open" })),
    /returns_invalid_view/,
  );
});

test("customer_phone is nullable; a non-string phone is a contract error", () => {
  const page = parseReturnListResponse(
    rawListResponse([rawListRow({ customer_phone: null })]),
  );
  assert.equal(page.requests[0]?.customerPhone, null);

  assert.throws(
    () =>
      parseReturnListResponse(
        rawListResponse([rawListRow({ customer_phone: 905321112233 })]),
      ),
    /returns_invalid_customer_phone/,
  );
});

test("seller_action_required is a strict boolean capability signal", () => {
  const page = parseReturnListResponse(
    rawListResponse([rawListRow({ seller_action_required: false })]),
  );
  assert.equal(page.requests[0]?.sellerActionRequired, false);

  for (const bogus of [1, "true", null]) {
    assert.throws(
      () =>
        parseReturnListResponse(
          rawListResponse([rawListRow({ seller_action_required: bogus })]),
        ),
      new RegExp(RETURNS_CONTRACT_ERROR_PREFIX),
    );
  }
});

test("collecting rows accept pending snapshots without invented values", () => {
  const page = parseReturnListResponse(
    rawListResponse([
      rawListRow({
        status: "COLLECTING",
        external_order_number_snapshot: null,
        reason_text: null,
        order_id: null,
        seller_action_required: false,
      }),
    ]),
  );
  const row = page.requests[0];
  assert.equal(row?.status, "COLLECTING");
  assert.equal(row?.externalOrderNumberSnapshot, null);
  assert.equal(row?.reasonText, null);
  assert.equal(row?.orderId, null);
});

test("rejects enum values outside the backend allowlists", () => {
  assert.throws(
    () =>
      parseReturnListResponse(
        rawListResponse([rawListRow({ status: "REFUNDED" })]),
      ),
    /returns_invalid_status/,
  );
  assert.throws(
    () =>
      parseReturnListResponse(
        rawListResponse([rawListRow({ issue_type: "EXCHANGE_REQUEST" })]),
      ),
    /returns_invalid_issue_type/,
  );
  assert.throws(
    () =>
      parseReturnListResponse(
        rawListRowShape({ image_requirement_snapshot: "MANDATORY" }),
      ),
    /returns_invalid_image_requirement_snapshot/,
  );
});

test("rejects malformed identity and version fields", () => {
  for (const bad of [0, -4, "41"]) {
    assert.throws(
      () => parseReturnListResponse(rawListRowShape({ id: bad })),
      /returns_invalid_id/,
    );
  }
  for (const bad of [0, null, "3"]) {
    assert.throws(
      () => parseReturnListResponse(rawListRowShape({ version: bad })),
      /returns_invalid_version/,
    );
  }
  assert.throws(
    () => parseReturnListResponse(rawListRowShape({ customer_id: "22" })),
    /returns_invalid_customer_id/,
  );
});

test("rejects a malformed list envelope", () => {
  assert.throws(
    () => parseReturnListResponse(rawListResponse([], { limit: 0 })),
    /returns_invalid_limit_shape/,
  );
  assert.throws(
    () => parseReturnListResponse(rawListResponse([], { limit: 101 })),
    /returns_invalid_limit_shape/,
  );
  assert.throws(
    () => parseReturnListResponse(rawListResponse([], { toplam: -1 })),
    /returns_invalid_toplam/,
  );
  assert.throws(
    () => parseReturnListResponse(rawListResponse([], { toplam: 2.5 })),
    /returns_invalid_toplam/,
  );
  assert.throws(
    () => parseReturnListResponse(rawListResponse([], { offset: -20 })),
    /returns_invalid_offset/,
  );
  assert.throws(
    () => parseReturnListResponse(rawListResponse([], { requests: {} })),
    /returns_invalid_requests/,
  );
});

test("toplam is consumed as the returned page length, never a total", () => {
  // A full page advertises another page; a short page ends the queue.
  // The parser mirrors the value shape-only — pagination logic (see
  // returns-format tests) reads it only as a page length.
  const full = parseReturnListResponse(
    rawListResponse(
      Array.from({ length: 20 }, (_, index) =>
        rawListRow({ id: index + 1 }),
      ),
      { toplam: 20, offset: 40 },
    ),
  );
  assert.equal(full.pageCount, 20);
  assert.equal(full.requests.length, 20);
  assert.equal(full.offset, 40);

  const short = parseReturnListResponse(
    rawListResponse([rawListRow()], { toplam: 1, offset: 40 }),
  );
  assert.equal(short.pageCount, 1);
});

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

test("parses a full detail response with customer, order and evidence", () => {
  const detail = parseReturnDetailResponse(rawDetail());

  assert.equal(detail.request.id, 41);
  assert.equal(detail.request.displayIssueType, "İade talebi");
  assert.equal(detail.request.sellerActionRequired, true);
  assert.equal(detail.customer?.whatsappNumber, "+905321112233");
  assert.equal(detail.customer?.name, "Elif Yılmaz");
  assert.equal(detail.order?.externalOrderNumber, "TR123456");
  assert.equal(detail.order?.productNameSnapshot, "Kişiye Özel Kupa");
  assert.equal(detail.evidence.length, 1);
  // Evidence carries an internal message reference only — never a URL.
  assert.equal(detail.evidence[0]?.messageId, 980);
  assert.deepEqual(detail.missingFields, []);
});

test("accepts absent customer/order and missing missing_fields", () => {
  const detail = parseReturnDetailResponse(
    rawDetail({
      customer: null,
      order: null,
      missing_fields: undefined,
      evidence: null,
    }),
  );
  assert.equal(detail.customer, null);
  assert.equal(detail.order, null);
  assert.deepEqual(detail.evidence, []);
  assert.deepEqual(detail.missingFields, []);
});

test("missing_fields only admits the backend allowlist, in order", () => {
  const detail = parseReturnDetailResponse(
    rawDetail({ missing_fields: ["order_number", "reason", "image"] }),
  );
  assert.deepEqual(detail.missingFields, ["order_number", "reason", "image"]);

  assert.throws(
    () => parseReturnDetailResponse(rawDetail({ missing_fields: ["photo"] })),
    /returns_invalid_missing_fields_entry/,
  );
  assert.throws(
    () => parseReturnDetailResponse(rawDetail({ missing_fields: "image" })),
    /returns_invalid_missing_fields/,
  );
});

test("evidence items require a positive internal message reference", () => {
  for (const bad of [0, -1, "980", null]) {
    assert.throws(
      () =>
        parseReturnDetailResponse(
          rawDetail({
            evidence: [
              {
                id: 71,
                seller_id: 3,
                request_id: 41,
                message_id: bad,
                created_at: "2026-08-10T12:04:00+00:00",
              },
            ],
          }),
        ),
      /returns_invalid_message_id/,
    );
  }
});

test("rejects a detail request without the backend display fields", () => {
  assert.throws(
    () =>
      parseReturnDetailResponse(
        rawDetail({ request: rawRequest() }),
      ),
    /returns_invalid_display_issue_type/,
  );
});

/* ------------------------------------------------------------------ */
/* mark_handled — the only seller action                               */
/* ------------------------------------------------------------------ */

test("parses the mark_handled response (request is the raw row)", () => {
  const result = parseMarkReturnHandledResponse({
    action: "mark_handled",
    changed: false,
    request: rawRequest({ status: "HANDLED", handled_at: "2026-08-11T09:00:00+00:00" }),
  });
  assert.equal(result.action, "mark_handled");
  assert.equal(result.changed, false);
  assert.equal(result.request.status, "HANDLED");
  assert.equal(result.request.handledAt, "2026-08-11T09:00:00+00:00");
});

test("no other action vocabulary exists: approve/reject/refund fail parsing", () => {
  for (const action of ["approve", "reject", "refund", "exchange", "cancel"]) {
    assert.throws(
      () =>
        parseMarkReturnHandledResponse({
          action,
          changed: true,
          request: rawRequest(),
        }),
      /returns_invalid_action/,
    );
  }
});

test("changed must be a strict boolean", () => {
  for (const bogus of [1, "true", null]) {
    assert.throws(
      () =>
        parseMarkReturnHandledResponse({
          action: "mark_handled",
          changed: bogus,
          request: rawRequest(),
        }),
      /returns_invalid_changed/,
    );
  }
});

/* ------------------------------------------------------------------ */
/* Photo-preference settings                                           */
/* ------------------------------------------------------------------ */

const rawSetting = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  issue_type: "DAMAGED_ITEM",
  display_name: "Hasarlı ürün",
  image_requirement: "REQUIRED",
  version: 2,
  updated_at: "2026-08-01T08:00:00+00:00",
  ...overrides,
});

test("parses the canonical six-row settings response", () => {
  const issueTypes = [
    "RETURN_REQUEST",
    "DAMAGED_ITEM",
    "WRONG_ITEM",
    "PRINT_OR_PERSONALIZATION_ISSUE",
    "DELIVERY_ISSUE",
    "OTHER_ORDER_ISSUE",
  ];
  const settings = parseReturnIssueSettingsList({
    settings: issueTypes.map((issueType, index) =>
      rawSetting({
        issue_type: issueType,
        image_requirement: index % 3 === 0 ? "REQUIRED" : index % 3 === 1 ? "OPTIONAL" : "NOT_REQUESTED",
      }),
    ),
  });
  assert.equal(settings.length, 6);
  assert.deepEqual(
    settings.map((setting) => setting.issueType),
    issueTypes,
  );
  assert.equal(settings[1]?.displayName, "Hasarlı ürün");
});

test("rejects unknown issue_type / image_requirement in settings", () => {
  assert.throws(
    () =>
      parseReturnIssueSettingsList({
        settings: [rawSetting({ issue_type: "REFUND" })],
      }),
    /returns_invalid_issue_type/,
  );
  assert.throws(
    () =>
      parseReturnIssueSettingsList({
        settings: [rawSetting({ image_requirement: "ALWAYS" })],
      }),
    /returns_invalid_image_requirement/,
  );
});

test("parses the per-row update response with the server-returned version", () => {
  const result = parseReturnIssueSettingUpdate({
    changed: true,
    setting: rawSetting({ image_requirement: "OPTIONAL", version: 3 }),
  });
  assert.equal(result.changed, true);
  assert.equal(result.setting.imageRequirement, "OPTIONAL");
  assert.equal(result.setting.version, 3);

  assert.throws(
    () => parseReturnIssueSettingUpdate({ changed: true }),
    /returns_invalid_setting/,
  );
});
