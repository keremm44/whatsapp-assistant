import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  normalizeSellerFeedbackCreatePayload,
  parseSellerFeedbackItemResponse,
  parseSellerFeedbackListResponse,
  validateSellerFeedbackCreatePayload,
} from "./feedback.ts";

const feedback = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  category: "problem",
  subject: "Sipariş ekranı",
  message: "Filtreyi kullanırken beklenmeyen bir durum oluşuyor.",
  status: "OPEN",
  version: 1,
  created_at: "2026-08-18T12:00:00+00:00",
  updated_at: "2026-08-18T12:00:00+00:00",
  resolved_at: null,
  ...overrides,
});

test("seller feedback list parses backend workflow state without invention", () => {
  const page = parseSellerFeedbackListResponse({
    total: 3,
    limit: 10,
    offset: 0,
    feedback: [
      feedback(),
      feedback({ id: 6, status: "IN_REVIEW", version: 2 }),
      feedback({
        id: 5,
        status: "RESOLVED",
        version: 3,
        resolved_at: "2026-08-18T13:00:00+00:00",
      }),
    ],
  });

  assert.equal(page.total, 3);
  assert.equal(page.feedback[0]?.status, "OPEN");
  assert.equal(page.feedback[1]?.status, "IN_REVIEW");
  assert.equal(page.feedback[2]?.status, "RESOLVED");
});

test("resolved_at and status must remain backend-consistent", () => {
  assert.throws(
    () =>
      parseSellerFeedbackItemResponse({
        feedback: feedback({ status: "RESOLVED", resolved_at: null }),
      }),
    /feedback_invalid_resolved_state_mismatch/,
  );

  assert.throws(
    () =>
      parseSellerFeedbackItemResponse({
        feedback: feedback({
          status: "OPEN",
          resolved_at: "2026-08-18T13:00:00+00:00",
        }),
      }),
    /feedback_invalid_resolved_state_mismatch/,
  );
});

test("unknown category or status fails closed", () => {
  assert.throws(
    () =>
      parseSellerFeedbackItemResponse({ feedback: feedback({ category: "bug" }) }),
    /feedback_invalid_category/,
  );
  assert.throws(
    () =>
      parseSellerFeedbackItemResponse({ feedback: feedback({ status: "CLOSED" }) }),
    /feedback_invalid_status/,
  );
});

test("seller parser does not project admin-internal fields", () => {
  const parsed = parseSellerFeedbackItemResponse({
    feedback: feedback({ admin_note: "internal note", seller_id: 42 }),
  }) as unknown as Record<string, unknown>;

  assert.equal("admin_note" in parsed, false);
  assert.equal("seller_id" in parsed, false);
});

test("pagination cannot claim rows outside total or above echoed limit", () => {
  assert.throws(
    () =>
      parseSellerFeedbackListResponse({
        total: 1,
        limit: 1,
        offset: 0,
        feedback: [feedback(), feedback({ id: 6 })],
      }),
    /feedback_invalid_feedback_limit/,
  );

  assert.throws(
    () =>
      parseSellerFeedbackListResponse({
        total: 1,
        limit: 10,
        offset: 1,
        feedback: [feedback()],
      }),
    /feedback_invalid_pagination_total_mismatch/,
  );
});

test("create payload trims seller text and never adds workflow fields", () => {
  assert.deepEqual(
    normalizeSellerFeedbackCreatePayload({
      category: "suggestion",
      subject: "  Yeni fikir  ",
      message: "  Açıklama  ",
    }),
    {
      category: "suggestion",
      subject: "Yeni fikir",
      message: "Açıklama",
    },
  );
});

test("client validation mirrors backend subject and message bounds", () => {
  assert.deepEqual(
    validateSellerFeedbackCreatePayload({
      category: "other",
      subject: "   ",
      message: "   ",
    }),
    {
      subject: "Konu zorunludur.",
      message: "Mesaj zorunludur.",
    },
  );

  const exact = "x".repeat(FEEDBACK_MESSAGE_MAX_LENGTH);
  assert.deepEqual(
    validateSellerFeedbackCreatePayload({
      category: "other",
      subject: "Konu",
      message: exact,
    }),
    {},
  );

  assert.match(
    validateSellerFeedbackCreatePayload({
      category: "other",
      subject: "Konu",
      message: `${exact}x`,
    }).message ?? "",
    /4000/,
  );
});
