/**
 * Presentation-logic tests for the Cevaplanamayan Sorular workspace
 * (`unanswered-format.ts`).
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/seller/unanswered-format.test.ts
 * (via `npm test`)
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { UnansweredQuestionSummary } from "./unanswered.ts";
import {
  buildDismissPayload,
  buildSetAnswerPayload,
  canAnswerUnanswered,
  canDismissUnanswered,
  classifyUnansweredMutationFailure,
  DEFAULT_UNANSWERED_VIEW,
  formatUnansweredDate,
  formatUnansweredTimestamp,
  getUnansweredConversationHref,
  getUnansweredOccurrenceCountLabel,
  hasAnotherUnansweredPage,
  mergeUnansweredPage,
  normalizeUnansweredQuestionIdParam,
  normalizeUnansweredViewParam,
  resolveUnansweredMutationSuccess,
  UNANSWERED_ANSWER_LABEL,
  UNANSWERED_ANSWER_MAX_LENGTH,
  UNANSWERED_ANSWER_SECTION_TITLE,
  UNANSWERED_DISMISS_CONFIRM_LABEL,
  UNANSWERED_DISMISS_EXPLANATION,
  UNANSWERED_DISMISS_LATER_ANSWER_NOTE,
  UNANSWERED_DISMISS_NOTE_LABEL,
  UNANSWERED_DISMISS_PERSISTENCE_NOTE,
  UNANSWERED_DISMISS_NOTE_MAX_LENGTH,
  UNANSWERED_DISMISS_TRIGGER_LABEL,
  UNANSWERED_FUTURE_ONLY_NOTE,
  UNANSWERED_PAGE_SIZE,
  UNANSWERED_SAVE_ANSWER_LABEL,
  UNANSWERED_STATUS_DISPLAY,
  UNANSWERED_VIEW_TABS,
  unansweredListEmptyCopy,
  unansweredWorkspaceHref,
} from "./unanswered-format.ts";

/* ------------------------------------------------------------------ */
/* Typed fixtures                                                      */
/* ------------------------------------------------------------------ */

const summary = (
  overrides: Partial<UnansweredQuestionSummary> = {},
): UnansweredQuestionSummary => ({
  id: 41,
  question: "Bulaşık makinesinde yıkanır mı?",
  status: "OPEN",
  answer: null,
  occurrenceCount: 3,
  firstSeenAt: "2026-08-07T10:00:00+00:00",
  lastSeenAt: "2026-08-07T12:00:00+00:00",
  version: 3,
  ...overrides,
});

/* ------------------------------------------------------------------ */
/* View tabs + view param                                              */
/* ------------------------------------------------------------------ */

test("the four approved views in attention-first order with locked labels", () => {
  assert.deepEqual(UNANSWERED_VIEW_TABS, [
    { view: "action_required", label: "Cevap Bekleyenler" },
    { view: "answered", label: "Cevaplananlar" },
    { view: "dismissed", label: "Görmezden Gelinenler" },
    { view: "all", label: "Tümü" },
  ]);
  assert.equal(DEFAULT_UNANSWERED_VIEW, "action_required");
});

test("canonical view params parse; anything else normalizes to action_required", () => {
  assert.equal(normalizeUnansweredViewParam("answered"), "answered");
  assert.equal(normalizeUnansweredViewParam("dismissed"), "dismissed");
  assert.equal(normalizeUnansweredViewParam("all"), "all");
  assert.equal(normalizeUnansweredViewParam("action_required"), "action_required");
  assert.equal(normalizeUnansweredViewParam(undefined), "action_required");
  assert.equal(normalizeUnansweredViewParam("pending"), "action_required");
  assert.equal(normalizeUnansweredViewParam("ALL"), "action_required");
  assert.equal(normalizeUnansweredViewParam(["dismissed", "all"]), "dismissed");
});

/* ------------------------------------------------------------------ */
/* Selected question id                                                */
/* ------------------------------------------------------------------ */

test("selection is a positive integer group id or nothing", () => {
  assert.equal(normalizeUnansweredQuestionIdParam("42"), 42);
  assert.equal(normalizeUnansweredQuestionIdParam(" 42 "), 42);
  assert.equal(normalizeUnansweredQuestionIdParam(["17", "18"]), 17);
  assert.equal(normalizeUnansweredQuestionIdParam("0"), null);
  assert.equal(normalizeUnansweredQuestionIdParam("-3"), null);
  assert.equal(normalizeUnansweredQuestionIdParam("1.5"), null);
  assert.equal(normalizeUnansweredQuestionIdParam("abc"), null);
  assert.equal(normalizeUnansweredQuestionIdParam(""), null);
  assert.equal(normalizeUnansweredQuestionIdParam(undefined), null);
});

/* ------------------------------------------------------------------ */
/* URL builder (no search param exists in V1)                          */
/* ------------------------------------------------------------------ */

test("href omits defaults and the selection when not requested", () => {
  assert.equal(unansweredWorkspaceHref({ view: "action_required" }), "/seller/unanswered");
  assert.equal(
    unansweredWorkspaceHref({ view: "dismissed" }),
    "/seller/unanswered?view=dismissed",
  );
  assert.equal(
    unansweredWorkspaceHref({ view: "all", questionId: 42 }),
    "/seller/unanswered?view=all&question=42",
  );
  for (const bad of [null, 0, -1, 2.5]) {
    assert.equal(
      unansweredWorkspaceHref({ view: "all", questionId: bad }),
      "/seller/unanswered?view=all",
    );
  }
});

test("tab navigation drops the selection by construction", () => {
  // Tab links are built without a questionId: switching views clears
  // the selected question (and restarts pagination, since there is no
  // offset param anywhere).
  const href = unansweredWorkspaceHref({ view: "answered" });
  assert.equal(href.includes("question"), false);
  assert.equal(href.includes("offset"), false);
});

/* ------------------------------------------------------------------ */
/* Status language + metadata                                          */
/* ------------------------------------------------------------------ */

test("one locked state line per canonical status", () => {
  assert.deepEqual(UNANSWERED_STATUS_DISPLAY.OPEN, {
    label: "Cevap bekliyor",
    tone: "accent",
  });
  assert.deepEqual(UNANSWERED_STATUS_DISPLAY.ANSWERED, {
    label: "Cevaplandı",
    tone: "resolved",
  });
  assert.deepEqual(UNANSWERED_STATUS_DISPLAY.DISMISSED, {
    label: "Görmezden gelindi",
    tone: "muted",
  });
});

test("occurrence count renders the real number verbatim", () => {
  assert.equal(getUnansweredOccurrenceCountLabel(1), "1 kez soruldu");
  assert.equal(getUnansweredOccurrenceCountLabel(4), "4 kez soruldu");
});

test("timestamps localize normally; unparseable input omits the line", () => {
  const date = formatUnansweredDate("2026-08-12T09:30:00+00:00");
  assert.equal(typeof date, "string");
  assert.match(date ?? "", /2026/);
  const stamp = formatUnansweredTimestamp("2026-08-12T09:30:00+00:00");
  assert.equal(typeof stamp, "string");
  assert.match(stamp ?? "", /2026/);
  assert.equal(formatUnansweredDate("not-a-date"), null);
  assert.equal(formatUnansweredTimestamp(""), null);
});

/* ------------------------------------------------------------------ */
/* Empty-state copy (locked)                                           */
/* ------------------------------------------------------------------ */

test("each view has its own calm empty copy", () => {
  assert.deepEqual(unansweredListEmptyCopy("action_required"), {
    title: "Şu anda cevap bekleyen bir soru yok.",
    description: null,
  });
  assert.deepEqual(unansweredListEmptyCopy("answered"), {
    title: "Henüz kayıtlı bir cevap yok.",
    description: null,
  });
  assert.deepEqual(unansweredListEmptyCopy("dismissed"), {
    title: "Henüz görmezden gelinen bir soru yok.",
    description: null,
  });
  const all = unansweredListEmptyCopy("all");
  assert.equal(all.title, "Henüz cevaplanamayan soru kaydı yok.");
  assert.equal(typeof all.description, "string");
});

/* ------------------------------------------------------------------ */
/* Pagination — the inspected page-length rule                         */
/* ------------------------------------------------------------------ */

test("a full returned page may continue; a short or empty page ends the queue", () => {
  assert.equal(UNANSWERED_PAGE_SIZE, 20);
  assert.equal(hasAnotherUnansweredPage(20), true);
  assert.equal(hasAnotherUnansweredPage(19), false);
  assert.equal(hasAnotherUnansweredPage(1), false);
  assert.equal(hasAnotherUnansweredPage(0), false);
});

test("page merges dedupe by group id and keep backend ordering verbatim", () => {
  const merged = mergeUnansweredPage(
    [summary({ id: 1 }), summary({ id: 2 })],
    [summary({ id: 2, question: "güncellendi" }), summary({ id: 3 })],
  );
  assert.deepEqual(
    merged.map((row) => row.id),
    [1, 2, 3],
  );
  // The first occurrence wins; an updated duplicate is not re-appended.
  assert.equal(merged[1]?.question, summary().question);
});

/* ------------------------------------------------------------------ */
/* Conversation link                                                   */
/* ------------------------------------------------------------------ */

test("a valid customer_id builds the canonical conversation route", () => {
  assert.equal(getUnansweredConversationHref(22), "/seller/conversations/22");
});

test("absent or invalid customer_id yields no conversation link", () => {
  assert.equal(getUnansweredConversationHref(null), null);
});

/* ------------------------------------------------------------------ */
/* Action capabilities (backend-supported transitions only)            */
/* ------------------------------------------------------------------ */

test("OPEN supports saving an answer and dismissing", () => {
  assert.equal(canAnswerUnanswered("OPEN"), true);
  assert.equal(canDismissUnanswered("OPEN"), true);
});

test("ANSWERED supports editing the answer but not normal dismiss", () => {
  assert.equal(canAnswerUnanswered("ANSWERED"), true);
  assert.equal(canDismissUnanswered("ANSWERED"), false);
});

test("DISMISSED supports a later answer (no separate reopen action)", () => {
  assert.equal(canAnswerUnanswered("DISMISSED"), true);
  assert.equal(canDismissUnanswered("DISMISSED"), false);
});

/* ------------------------------------------------------------------ */
/* set_answer payload                                                  */
/* ------------------------------------------------------------------ */

test("set_answer carries the rendered version and the trimmed answer", () => {
  assert.deepEqual(
    buildSetAnswerPayload({ version: 7, answer: "  Evet, uygundur.  " }),
    { action: "set_answer", expected_version: 7, answer: "Evet, uygundur." },
  );
});

test("set_answer is capped at the backend max length", () => {
  const payload = buildSetAnswerPayload({
    version: 2,
    answer: "x".repeat(4200),
  });
  assert.equal(payload.answer.length, UNANSWERED_ANSWER_MAX_LENGTH);
  assert.equal(UNANSWERED_ANSWER_MAX_LENGTH, 4000);
});

test("set_answer never carries a dismiss note", () => {
  const payload = buildSetAnswerPayload({ version: 3, answer: "Evet." });
  assert.equal("note" in payload, false);
  assert.deepEqual(Object.keys(payload), ["action", "expected_version", "answer"]);
});

/* ------------------------------------------------------------------ */
/* dismiss payload                                                     */
/* ------------------------------------------------------------------ */

test("dismiss carries the rendered version and an optional note", () => {
  assert.deepEqual(
    buildDismissPayload({ version: 3, note: "  Ürün satışta değil.  " }),
    { action: "dismiss", expected_version: 3, note: "Ürün satışta değil." },
  );
  const withoutNote = buildDismissPayload({ version: 3, note: "   " });
  assert.deepEqual(withoutNote, { action: "dismiss", expected_version: 3 });
  assert.equal("note" in withoutNote, false);
});

test("the dismiss note is capped at the backend max length", () => {
  const payload = buildDismissPayload({ version: 3, note: "n".repeat(1100) });
  assert.equal(payload.note?.length, UNANSWERED_DISMISS_NOTE_MAX_LENGTH);
  assert.equal(UNANSWERED_DISMISS_NOTE_MAX_LENGTH, 1000);
});

test("dismiss never carries an answer", () => {
  const payload = buildDismissPayload({ version: 3, note: "Not." });
  assert.equal("answer" in payload, false);
});

test("dismiss copy never reads as deletion", () => {
  assert.equal(UNANSWERED_DISMISS_TRIGGER_LABEL, "Bu soruyu görmezden gel");
  assert.equal(UNANSWERED_DISMISS_CONFIRM_LABEL, "Görmezden gel");
  assert.equal(UNANSWERED_DISMISS_NOTE_LABEL, "Not (isteğe bağlı)");
  const dismissCopy = [
    UNANSWERED_DISMISS_TRIGGER_LABEL,
    UNANSWERED_DISMISS_CONFIRM_LABEL,
    UNANSWERED_DISMISS_EXPLANATION,
    UNANSWERED_DISMISS_PERSISTENCE_NOTE,
    UNANSWERED_DISMISS_LATER_ANSWER_NOTE,
  ].join(" ");
  assert.equal(/sil|delete|spam|ban/i.test(dismissCopy), false);
});

test("dismiss confirmation states persistence and later answering", () => {
  assert.equal(
    UNANSWERED_DISMISS_PERSISTENCE_NOTE,
    "Bu soruyu görmezden geldiğinizde aynı soru tekrar geldiğinde Cevap Bekleyenler listesine otomatik dönmez.",
  );
  assert.equal(
    UNANSWERED_DISMISS_LATER_ANSWER_NOTE,
    "Daha sonra Görmezden Gelinenler bölümünden tekrar açıp cevap kaydedebilirsiniz.",
  );
  assert.equal(UNANSWERED_DISMISS_EXPLANATION, UNANSWERED_DISMISS_PERSISTENCE_NOTE);
  assert.match(UNANSWERED_DISMISS_PERSISTENCE_NOTE, /otomatik dönmez/);
  assert.equal(
    /geçici|bir süre|otomatik.*döner|yeniden açılır/i.test(
      UNANSWERED_DISMISS_PERSISTENCE_NOTE,
    ),
    false,
  );
});

/* ------------------------------------------------------------------ */
/* Future-only saved-answer semantics (the most important copy)        */
/* ------------------------------------------------------------------ */

test("the saved-answer note is the locked future-only sentence", () => {
  assert.equal(
    UNANSWERED_FUTURE_ONLY_NOTE,
    "Bu cevap geçmiş konuşmalara gönderilmez. Bundan sonra aynı soru tekrar geldiğinde asistan bu kayıtlı cevabı kullanabilir.",
  );
});

test("the copy explicitly says past conversations are not messaged", () => {
  assert.match(UNANSWERED_FUTURE_ONLY_NOTE, /geçmiş konuşmalara gönderilmez/);
});

test("approved copy makes no AI / fuzzy / semantic promises", () => {
  const approvedCopy = [
    UNANSWERED_FUTURE_ONLY_NOTE,
    UNANSWERED_DISMISS_EXPLANATION,
    UNANSWERED_DISMISS_PERSISTENCE_NOTE,
    UNANSWERED_DISMISS_LATER_ANSWER_NOTE,
    UNANSWERED_ANSWER_SECTION_TITLE,
    UNANSWERED_SAVE_ANSWER_LABEL,
    UNANSWERED_ANSWER_LABEL,
    UNANSWERED_DISMISS_TRIGGER_LABEL,
    ...UNANSWERED_VIEW_TABS.map((tab) => tab.label),
    ...Object.values(UNANSWERED_STATUS_DISPLAY).map((entry) => entry.label),
    unansweredListEmptyCopy("action_required").title,
    unansweredListEmptyCopy("answered").title,
    unansweredListEmptyCopy("dismissed").title,
    unansweredListEmptyCopy("all").title,
  ].join(" ");
  // No “AI”, no learning/training/improvement claims, no fuzzy or
  // semantic-matching guarantees, no accuracy/confidence numbers.
  assert.equal(
    /yapay zeka|\bAI\b|öğren(ecek|ir|iyor)|eğit(i|le)|model|benzer tüm|benzeri soruları anlar|fuzzy|semantik|embedding|güven oranı|%100|mükemmel/i.test(
      approvedCopy,
    ),
    false,
    `forbidden AI/matching claim found in approved copy: ${approvedCopy}`,
  );
});

/* ------------------------------------------------------------------ */
/* Mutation failure classification                                     */
/* ------------------------------------------------------------------ */

test("409 is a conflict, 422 is validation, anything else is retryable", () => {
  assert.equal(classifyUnansweredMutationFailure(409), "conflict");
  assert.equal(classifyUnansweredMutationFailure(422), "validation");
  assert.equal(classifyUnansweredMutationFailure(500), "retryable");
  assert.equal(classifyUnansweredMutationFailure(503), "retryable");
  assert.equal(classifyUnansweredMutationFailure(0), "retryable");
  assert.equal(classifyUnansweredMutationFailure(null), "retryable");
});

/* ------------------------------------------------------------------ */
/* Success routing (backend truth decides the next view)               */
/* ------------------------------------------------------------------ */

test("set_answer success routing follows the queue membership rules", () => {
  // The question leaves the OPEN queue.
  assert.equal(
    resolveUnansweredMutationSuccess("action_required", "set_answer"),
    "clear_selection",
  );
  // ANSWERED within “all” refreshes into the truthful state.
  assert.equal(
    resolveUnansweredMutationSuccess("all", "set_answer"),
    "refresh",
  );
  // Same queue membership for the answered view.
  assert.equal(
    resolveUnansweredMutationSuccess("answered", "set_answer"),
    "refresh",
  );
  // Answering a dismissed question moves it out of that queue.
  assert.equal(
    resolveUnansweredMutationSuccess("dismissed", "set_answer"),
    "clear_selection",
  );
});

test("dismiss success routing follows the queue membership rules", () => {
  assert.equal(
    resolveUnansweredMutationSuccess("action_required", "dismiss"),
    "clear_selection",
  );
  assert.equal(
    resolveUnansweredMutationSuccess("all", "dismiss"),
    "refresh",
  );
});
