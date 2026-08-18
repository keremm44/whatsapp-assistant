import assert from "node:assert/strict";
import test from "node:test";

import {
  feedbackCategoryLabel,
  feedbackStatusLabel,
  parseSellerFeedbackCreateResponse,
  parseSellerFeedbackListResponse,
} from "./feedback";

const row = {
  id: 7,
  category: "problem",
  subject: "Sipariş ekranı",
  message: "Filtreyi kullanırken sorun yaşıyorum.",
  status: "IN_REVIEW",
  version: 2,
  created_at: "2026-08-18T12:00:00Z",
  updated_at: "2026-08-18T13:00:00Z",
  resolved_at: null,
};

test("parses seller feedback create response", () => {
  const parsed = parseSellerFeedbackCreateResponse({ feedback: row });
  assert.equal(parsed.id, 7);
  assert.equal(parsed.category, "problem");
  assert.equal(parsed.status, "IN_REVIEW");
  assert.equal(parsed.resolvedAt, null);
});

test("parses seller feedback pagination without leaking extra fields", () => {
  const parsed = parseSellerFeedbackListResponse({
    total: 1,
    limit: 10,
    offset: 0,
    feedback: [{ ...row, admin_note: "internal", seller_id: 42 }],
  });
  assert.equal(parsed.total, 1);
  assert.equal(parsed.feedback.length, 1);
  assert.equal("admin_note" in parsed.feedback[0]!, false);
  assert.equal("seller_id" in parsed.feedback[0]!, false);
});

test("rejects invalid seller feedback workflow state", () => {
  assert.throws(() =>
    parseSellerFeedbackCreateResponse({
      feedback: { ...row, status: "RESOLVED", resolved_at: null },
    }),
  );
});

test("rejects unknown category and malformed pagination", () => {
  assert.throws(() =>
    parseSellerFeedbackCreateResponse({
      feedback: { ...row, category: "bug" },
    }),
  );
  assert.throws(() =>
    parseSellerFeedbackListResponse({
      total: -1,
      limit: 10,
      offset: 0,
      feedback: [],
    }),
  );
});

test("maps seller-facing labels", () => {
  assert.equal(feedbackCategoryLabel("suggestion"), "Öneri");
  assert.equal(feedbackCategoryLabel("complaint"), "Şikayet");
  assert.equal(feedbackStatusLabel("OPEN"), "Gönderildi");
  assert.equal(feedbackStatusLabel("RESOLVED"), "Çözüldü");
});
