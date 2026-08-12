/**
 * Contract tests for the Cevaplanamayan Sorular parsers
 * (`unanswered.ts`).
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/seller/unanswered.test.ts
 * (via `npm test`)
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseUnansweredActionResponse,
  parseUnansweredDetailResponse,
  parseUnansweredListResponse,
} from "./unanswered.ts";

/* ------------------------------------------------------------------ */
/* Raw fixtures (backend response shapes, verbatim key names)          */
/* ------------------------------------------------------------------ */

const rawGroupRow = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 41,
  seller_id: 11,
  canonical_question: "Bulaşık makinesinde yıkanır mı?",
  normalized_question: "bulaşık makinesinde yıkanır mı",
  status: "OPEN",
  answer_text: null,
  occurrence_count: 3,
  first_seen_at: "2026-08-07T10:00:00+00:00",
  last_seen_at: "2026-08-07T12:00:00+00:00",
  version: 3,
  answered_at: null,
  answered_by_profile_id: null,
  dismissed_at: null,
  dismissed_by_profile_id: null,
  dismiss_note: null,
  created_at: "2026-08-07T10:00:00+00:00",
  updated_at: "2026-08-07T12:00:00+00:00",
  ...overrides,
});

/** List rows use present_group_summary (different key names!). */
const rawSummary = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 41,
  question: "Bulaşık makinesinde yıkanır mı?",
  status: "OPEN",
  answer: null,
  occurrence_count: 3,
  first_seen_at: "2026-08-07T10:00:00+00:00",
  last_seen_at: "2026-08-07T12:00:00+00:00",
  version: 3,
  ...overrides,
});

const rawListResponse = (
  questions: Record<string, unknown>[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  view: "action_required",
  toplam: questions.length,
  limit: 20,
  offset: 0,
  questions,
  ...overrides,
});

/** List response containing exactly one customized row. */
const rawSingleRow = (
  row: Record<string, unknown>,
): Record<string, unknown> => rawListResponse([rawSummary(row)]);

const rawOccurrence = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 9,
  seller_id: 11,
  group_id: 41,
  customer_id: 22,
  message_id: 101,
  question_text: "bulaşık makinesine atılıyor mu acaba",
  category: "unclear",
  suggested_field: null,
  metadata: {},
  occurred_at: "2026-08-07T12:00:00+00:00",
  ...overrides,
});

const rawDetail = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  question: rawGroupRow(),
  occurrences: [rawOccurrence()],
  ...overrides,
});

/* ------------------------------------------------------------------ */
/* List envelope + rows                                                */
/* ------------------------------------------------------------------ */

test("parses a complete list row (present_group_summary keys)", () => {
  const page = parseUnansweredListResponse(
    rawListResponse([
      rawSummary({
        question: "Bu kupa mikrodalgaya girebilir mi?",
        occurrence_count: 4,
        status: "ANSWERED",
        answer: "Evet, mikrodalga kullanımına uygundur.",
      }),
    ]),
  );

  assert.equal(page.view, "action_required");
  assert.equal(page.pageCount, 1);
  assert.equal(page.limit, 20);
  assert.equal(page.offset, 0);

  const row = page.questions[0];
  assert.equal(row?.id, 41);
  // The canonical question arrives byte-exact — never rewritten.
  assert.equal(row?.question, "Bu kupa mikrodalgaya girebilir mi?");
  assert.equal(row?.status, "ANSWERED");
  assert.equal(row?.answer, "Evet, mikrodalga kullanımına uygundur.");
  assert.equal(row?.occurrenceCount, 4);
  assert.equal(row?.firstSeenAt, "2026-08-07T10:00:00+00:00");
  assert.equal(row?.lastSeenAt, "2026-08-07T12:00:00+00:00");
  assert.equal(row?.version, 3);
});

test("each canonical view parses through unchanged", () => {
  for (const view of ["action_required", "answered", "dismissed", "all"]) {
    const page = parseUnansweredListResponse(rawListResponse([], { view }));
    assert.equal(page.view, view);
  }
});

test("rejects an unknown view instead of coercing it", () => {
  assert.throws(
    () => parseUnansweredListResponse(rawListResponse([], { view: "pending" })),
    /unanswered_invalid_view/,
  );
});

test("all three canonical statuses parse; unknown status fails closed", () => {
  for (const status of ["OPEN", "ANSWERED", "DISMISSED"]) {
    const page = parseUnansweredListResponse(rawSingleRow({ status }));
    assert.equal(page.questions[0]?.status, status);
  }
  assert.throws(
    () => parseUnansweredListResponse(rawSingleRow({ status: "RESOLVED" })),
    /unanswered_invalid_status/,
  );
  assert.throws(
    () => parseUnansweredListResponse(rawSingleRow({ status: "open" })),
    /unanswered_invalid_status/,
  );
});

test("occurrence_count is a strict non-negative integer", () => {
  const page = parseUnansweredListResponse(rawSingleRow({ occurrence_count: 0 }));
  assert.equal(page.questions[0]?.occurrenceCount, 0);

  for (const bad of [-1, 1.5, "3", null]) {
    assert.throws(
      () => parseUnansweredListResponse(rawSingleRow({ occurrence_count: bad })),
      /unanswered_invalid_occurrence_count/,
    );
  }
});

test("answer is nullable; a non-string saved answer is a contract error", () => {
  const page = parseUnansweredListResponse(rawSingleRow({ answer: null }));
  assert.equal(page.questions[0]?.answer, null);

  assert.throws(
    () => parseUnansweredListResponse(rawSingleRow({ answer: 42 })),
    /unanswered_invalid_answer/,
  );
});

test("rejects malformed identity and version fields", () => {
  for (const bad of [0, -4, "41", null]) {
    assert.throws(
      () => parseUnansweredListResponse(rawSingleRow({ id: bad })),
      /unanswered_invalid_id/,
    );
  }
  for (const bad of [0, null, "3"]) {
    assert.throws(
      () => parseUnansweredListResponse(rawSingleRow({ version: bad })),
      /unanswered_invalid_version/,
    );
  }
  assert.throws(
    () => parseUnansweredListResponse(rawSingleRow({ question: null })),
    /unanswered_invalid_question/,
  );
  assert.throws(
    () => parseUnansweredListResponse(rawSingleRow({ first_seen_at: null })),
    /unanswered_invalid_first_seen_at/,
  );
  assert.throws(
    () => parseUnansweredListResponse(rawSingleRow({ last_seen_at: 12 })),
    /unanswered_invalid_last_seen_at/,
  );
});

test("rejects a malformed list envelope", () => {
  assert.throws(
    () => parseUnansweredListResponse(rawListResponse([], { limit: 0 })),
    /unanswered_invalid_limit_shape/,
  );
  assert.throws(
    () => parseUnansweredListResponse(rawListResponse([], { limit: 101 })),
    /unanswered_invalid_limit_shape/,
  );
  assert.throws(
    () => parseUnansweredListResponse(rawListResponse([], { toplam: -1 })),
    /unanswered_invalid_toplam/,
  );
  assert.throws(
    () => parseUnansweredListResponse(rawListResponse([], { offset: -20 })),
    /unanswered_invalid_offset/,
  );
  assert.throws(
    () => parseUnansweredListResponse(rawListResponse([], { questions: {} })),
    /unanswered_invalid_questions/,
  );
});

test("toplam mirrors the returned page length — it is not a global total", () => {
  // Inspected backend semantics: database.py computes
  // toplam = len(result.data) of the paginated range.
  const full = parseUnansweredListResponse(
    rawListResponse(
      Array.from({ length: 20 }, (_, index) => rawSummary({ id: index + 1 })),
      { toplam: 20, offset: 40 },
    ),
  );
  assert.equal(full.pageCount, 20);
  assert.equal(full.questions.length, 20);
  assert.equal(full.offset, 40);

  const short = parseUnansweredListResponse(
    rawListResponse([rawSummary()], { toplam: 1, offset: 40 }),
  );
  assert.equal(short.pageCount, 1);
});

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

test("parses the full detail row and its occurrences", () => {
  const detail = parseUnansweredDetailResponse(
    rawDetail({
      question: rawGroupRow({
        status: "DISMISSED",
        dismissed_at: "2026-08-08T09:00:00+00:00",
        dismiss_note: "Ürün artık satılmıyor.",
      }),
    }),
  );

  assert.equal(detail.question.id, 41);
  assert.equal(detail.question.canonicalQuestion, "Bulaşık makinesinde yıkanır mı?");
  assert.equal(detail.question.status, "DISMISSED");
  assert.equal(detail.question.dismissNote, "Ürün artık satılmıyor.");
  assert.equal(detail.question.dismissedAt, "2026-08-08T09:00:00+00:00");
  assert.equal(detail.question.answeredAt, null);

  const occurrence = detail.occurrences[0];
  assert.equal(occurrence?.id, 9);
  assert.equal(occurrence?.customerId, 22);
  assert.equal(occurrence?.messageId, 101);
  // The actual customer wording, byte-exact (raw casing preserved).
  assert.equal(occurrence?.questionText, "bulaşık makinesine atılıyor mu acaba");
  assert.equal(occurrence?.occurredAt, "2026-08-07T12:00:00+00:00");
});

test("accepts absent/internal-null occurrence references", () => {
  const detail = parseUnansweredDetailResponse(
    rawDetail({
      occurrences: [rawOccurrence({ customer_id: null, message_id: null })],
    }),
  );
  assert.equal(detail.occurrences[0]?.customerId, null);
  assert.equal(detail.occurrences[0]?.messageId, null);

  const empty = parseUnansweredDetailResponse(
    rawDetail({ occurrences: undefined }),
  );
  assert.deepEqual(empty.occurrences, []);
});

test("rejects occurrences with malformed references", () => {
  for (const bad of [0, "22"]) {
    assert.throws(
      () =>
        parseUnansweredDetailResponse(
          rawDetail({ occurrences: [rawOccurrence({ customer_id: bad })] }),
        ),
      /unanswered_invalid_customer_id/,
    );
  }
  assert.throws(
    () =>
      parseUnansweredDetailResponse(
        rawDetail({ occurrences: [rawOccurrence({ message_id: -1 })] }),
      ),
    /unanswered_invalid_message_id/,
  );
  assert.throws(
    () =>
      parseUnansweredDetailResponse(
        rawDetail({ occurrences: [rawOccurrence({ question_text: null })] }),
      ),
    /unanswered_invalid_question_text/,
  );
  assert.throws(
    () =>
      parseUnansweredDetailResponse(
        rawDetail({ occurrences: [rawOccurrence({ occurred_at: null })] }),
      ),
    /unanswered_invalid_occurred_at/,
  );
});

test("answered rows carry the saved answer byte-exact", () => {
  const detail = parseUnansweredDetailResponse(
    rawDetail({
      question: rawGroupRow({
        status: "ANSWERED",
        answer_text: "  Evet.\nSıcak su önermiyoruz.  ",
        answered_at: "2026-08-08T09:00:00+00:00",
      }),
    }),
  );
  assert.equal(
    detail.question.answerText,
    "  Evet.\nSıcak su önermiyoruz.  ",
  );
  assert.equal(detail.question.answeredAt, "2026-08-08T09:00:00+00:00");
});

/* ------------------------------------------------------------------ */
/* Actions — set_answer / dismiss results                              */
/* ------------------------------------------------------------------ */

test("parses both action responses (question is the full row)", () => {
  const answered = parseUnansweredActionResponse({
    action: "set_answer",
    changed: true,
    question: rawGroupRow({
      status: "ANSWERED",
      answer_text: "Evet.",
      version: 4,
      answered_at: "2026-08-09T10:00:00+00:00",
    }),
  });
  assert.equal(answered.action, "set_answer");
  assert.equal(answered.changed, true);
  assert.equal(answered.question.status, "ANSWERED");
  assert.equal(answered.question.version, 4);

  const dismissed = parseUnansweredActionResponse({
    action: "dismiss",
    changed: false,
    question: rawGroupRow({ status: "DISMISSED" }),
  });
  assert.equal(dismissed.action, "dismiss");
  assert.equal(dismissed.changed, false);
});

test("no other action vocabulary exists in the contract", () => {
  for (const action of ["reopen", "delete", "answer", "ignore"]) {
    assert.throws(
      () =>
        parseUnansweredActionResponse({
          action,
          changed: true,
          question: rawGroupRow(),
        }),
      /unanswered_invalid_action/,
    );
  }
});

test("changed must be a strict boolean", () => {
  for (const bogus of [1, "true", null]) {
    assert.throws(
      () =>
        parseUnansweredActionResponse({
          action: "set_answer",
          changed: bogus,
          question: rawGroupRow(),
        }),
      /unanswered_invalid_changed/,
    );
  }
});
