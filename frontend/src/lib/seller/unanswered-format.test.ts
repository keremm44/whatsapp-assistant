/**
 * Presentation-logic tests for the Cevaplanamayan Sorular workspace
 * (`unanswered-format.ts`).
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/seller/unanswered-format.test.ts
 * (via `npm test`)
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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
  gateModeForUnansweredSuccess,
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
  UNANSWERED_NOT_A_RULE_NOTE,
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
  sellerActionRequired: true,
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

test("question selection is a positive integer or nothing", () => {
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
/* URL builder                                                         */
/* ------------------------------------------------------------------ */

test("href omits the default view and never carries an offset", () => {
  assert.equal(
    unansweredWorkspaceHref({ view: "action_required" }),
    "/seller/unanswered",
  );
  assert.equal(
    unansweredWorkspaceHref({ view: "answered" }),
    "/seller/unanswered?view=answered",
  );
  assert.equal(
    unansweredWorkspaceHref({ view: "dismissed" }),
    "/seller/unanswered?view=dismissed",
  );
  assert.equal(
    unansweredWorkspaceHref({ view: "all" }),
    "/seller/unanswered?view=all",
  );
});

test("href carries a valid selected question and filters drop it by omission", () => {
  assert.equal(
    unansweredWorkspaceHref({ view: "all", questionId: 42 }),
    "/seller/unanswered?view=all&question=42",
  );
  assert.equal(
    unansweredWorkspaceHref({ view: "action_required", questionId: 42 }),
    "/seller/unanswered?question=42",
  );
  assert.equal(
    unansweredWorkspaceHref({ view: "all" }).includes("question"),
    false,
  );
});

/* ------------------------------------------------------------------ */
/* Status / copy                                                       */
/* ------------------------------------------------------------------ */

test("one locked display per canonical status", () => {
  assert.deepEqual(UNANSWERED_STATUS_DISPLAY.OPEN, {
    label: "Cevap bekliyor",
    tone: "accent",
  });
  assert.deepEqual(UNANSWERED_STATUS_DISPLAY.ANSWERED, {
    label: "Cevaplandı",
    tone: "success",
  });
  assert.deepEqual(UNANSWERED_STATUS_DISPLAY.DISMISSED, {
    label: "Görmezden gelindi",
    tone: "muted",
  });
});

test("occurrence count uses a short factual label", () => {
  assert.equal(getUnansweredOccurrenceCountLabel(1), "1 kez soruldu");
  assert.equal(getUnansweredOccurrenceCountLabel(4), "4 kez soruldu");
});

test("timestamps format normally and invalid values are omitted", () => {
  assert.match(formatUnansweredDate("2026-08-07T12:00:00+00:00") ?? "", /2026/);
  assert.match(
    formatUnansweredTimestamp("2026-08-07T12:00:00+00:00") ?? "",
    /2026/,
  );
  assert.equal(formatUnansweredDate("not-a-date"), null);
  assert.equal(formatUnansweredTimestamp("not-a-date"), null);
});

/* ------------------------------------------------------------------ */
/* Empty states                                                        */
/* ------------------------------------------------------------------ */

test("each view has calm empty copy", () => {
  assert.deepEqual(unansweredListEmptyCopy("action_required"), {
    title: "Şu anda cevap bekleyen soru yok.",
    description: null,
  });
  assert.deepEqual(unansweredListEmptyCopy("answered"), {
    title: "Henüz cevaplanan soru yok.",
    description: null,
  });
  assert.deepEqual(unansweredListEmptyCopy("dismissed"), {
    title: "Henüz görmezden gelinen soru yok.",
    description: null,
  });
  assert.equal(unansweredListEmptyCopy("all").title, "Henüz soru kaydı yok.");
});

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

test("full page may continue; short or empty page ends the queue", () => {
  assert.equal(UNANSWERED_PAGE_SIZE, 20);
  assert.equal(hasAnotherUnansweredPage(20), true);
  assert.equal(hasAnotherUnansweredPage(19), false);
  assert.equal(hasAnotherUnansweredPage(1), false);
  assert.equal(hasAnotherUnansweredPage(0), false);
});

test("page merge dedupes by id and preserves backend ordering", () => {
  const merged = mergeUnansweredPage(
    [summary({ id: 1 }), summary({ id: 2 })],
    [summary({ id: 2, question: "güncel" }), summary({ id: 3 })],
  );
  assert.deepEqual(
    merged.map((row) => row.id),
    [1, 2, 3],
  );
  assert.equal(merged[1]?.question, summary().question);
});

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

test("OPEN may be answered or dismissed; ANSWERED/DISMISSED may be answered but not dismissed", () => {
  assert.equal(canAnswerUnanswered("OPEN"), true);
  assert.equal(canAnswerUnanswered("ANSWERED"), true);
  assert.equal(canAnswerUnanswered("DISMISSED"), true);
  assert.equal(canDismissUnanswered("OPEN"), true);
  assert.equal(canDismissUnanswered("ANSWERED"), false);
  assert.equal(canDismissUnanswered("DISMISSED"), false);
});

test("set_answer payload preserves answer text and current version", () => {
  assert.deepEqual(
    buildSetAnswerPayload({
      version: 3,
      answer: "  İki yıl garanti.  ",
    }),
    {
      action: "set_answer",
      expected_version: 3,
      answer_text: "İki yıl garanti.",
    },
  );
});

test("answer text is capped at backend max length", () => {
  const payload = buildSetAnswerPayload({
    version: 3,
    answer: "x".repeat(UNANSWERED_ANSWER_MAX_LENGTH + 100),
  });
  assert.equal(payload.answer_text.length, UNANSWERED_ANSWER_MAX_LENGTH);
});

test("dismiss payload omits blank notes and caps a long note", () => {
  assert.deepEqual(buildDismissPayload({ version: 4, note: "  " }), {
    action: "dismiss",
    expected_version: 4,
  });
  const payload = buildDismissPayload({
    version: 4,
    note: "x".repeat(UNANSWERED_DISMISS_NOTE_MAX_LENGTH + 50),
  });
  assert.equal(payload.note?.length, UNANSWERED_DISMISS_NOTE_MAX_LENGTH);
});

test("409 is a conflict; anything else is retryable", () => {
  assert.equal(classifyUnansweredMutationFailure(409), "conflict");
  assert.equal(classifyUnansweredMutationFailure(500), "retryable");
  assert.equal(classifyUnansweredMutationFailure(null), "retryable");
});

/* ------------------------------------------------------------------ */
/* Cross-panel navigation                                              */
/* ------------------------------------------------------------------ */

test("occurrence customer id builds the canonical conversation route", () => {
  assert.equal(getUnansweredConversationHref(22), "/seller/conversations/22");
  assert.equal(UNANSWERED_OPEN_CONVERSATION_LABEL, "Konuşmayı aç");
});

test("missing/invalid occurrence customer id yields no link", () => {
  assert.equal(getUnansweredConversationHref(null), null);
  assert.equal(getUnansweredConversationHref(undefined), null);
  assert.equal(getUnansweredConversationHref(0), null);
  assert.equal(getUnansweredConversationHref(-2), null);
});

/* ------------------------------------------------------------------ */
/* Locked trust copy                                                   */
/* ------------------------------------------------------------------ */

test("knowledge-boundary notes stay explicit", () => {
  assert.equal(
    UNANSWERED_FUTURE_ONLY_NOTE,
    "Bu cevap yalnızca bundan sonraki aynı sorularda kullanılacak.",
  );
  assert.equal(
    UNANSWERED_NOT_A_RULE_NOTE,
    "Bu kayıt asistan kuralı değildir; kaydedilmiş doğru cevaptır.",
  );
  assert.equal(UNANSWERED_ANSWER_SECTION_TITLE, "Doğru cevap");
  assert.equal(UNANSWERED_SAVE_ANSWER_LABEL, "Cevabı kaydet");
  assert.equal(UNANSWERED_ANSWER_LABEL, "Cevap");
});

test("dismiss confirmation copy explains both persistence and future answer path", () => {
  assert.equal(UNANSWERED_DISMISS_TRIGGER_LABEL, "Görmezden gel");
  assert.equal(UNANSWERED_DISMISS_CONFIRM_LABEL, "Görmezden gel");
  assert.equal(UNANSWERED_DISMISS_NOTE_LABEL, "Not (isteğe bağlı)");
  assert.equal(
    UNANSWERED_DISMISS_EXPLANATION,
    "Bu soru cevap bekleyenler listesinden kaldırılacak.",
  );
  assert.equal(
    UNANSWERED_DISMISS_PERSISTENCE_NOTE,
    "Soru kaydı silinmez; geçmişte görünmeye devam eder.",
  );
  assert.equal(
    UNANSWERED_DISMISS_LATER_ANSWER_NOTE,
    "Daha sonra bu kaydı açıp doğru cevabı ekleyebilirsiniz.",
  );
});

/* ------------------------------------------------------------------ */
/* Repo-wired regression: action failures stay local to the detail    */
/* ------------------------------------------------------------------ */

const read = (relative: string): string => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.resolve(dir, relative), "utf8");
};

test("answer/dismiss failures cannot blank the unanswered list", () => {
  const workspace = read(
    "../../components/seller/unanswered/unanswered-workspace.tsx",
  );
  const detail = read(
    "../../components/seller/unanswered/unanswered-question-detail.tsx",
  );
  const answer = read(
    "../../components/seller/unanswered/unanswered-answer-editor.tsx",
  );
  const dismiss = read(
    "../../components/seller/unanswered/unanswered-dismiss-dialog.tsx",
  );

  assert.match(workspace, /<UnansweredListPanel\s+bootstrap=\{listBootstrap\}/);
  assert.match(workspace, /<UnansweredDetailRegion/);
  assert.match(workspace, /router\.refresh\(\)/);
  assert.match(detail, /<UnansweredAnswerEditor/);
  assert.match(detail, /<UnansweredDismissDialog/);
  assert.match(answer, /setError\(/);
  assert.match(dismiss, /setError\(/);
});

/* ------------------------------------------------------------------ */
/* Mutation-success handoff: the completed record must leave           */
/* action_required through navigation, not a same-URL refresh.         */
/* ------------------------------------------------------------------ */

test("success resolver drops the selection in action_required and keeps it elsewhere", () => {
  assert.deepEqual(resolveUnansweredMutationSuccess("action_required", 41), {
    mode: "navigate",
    href: "/seller/unanswered",
  });
  assert.deepEqual(resolveUnansweredMutationSuccess("answered", 41), {
    mode: "refresh",
  });
  assert.deepEqual(resolveUnansweredMutationSuccess("dismissed", 41), {
    mode: "refresh",
  });
  assert.deepEqual(resolveUnansweredMutationSuccess("all", 41), {
    mode: "refresh",
  });
});

test("gate mode keeps action_required locked through route handoff and releases refresh modes locally", () => {
  assert.equal(gateModeForUnansweredSuccess({ mode: "navigate", href: "/seller/unanswered" }), "route_handoff");
  assert.equal(gateModeForUnansweredSuccess({ mode: "refresh" }), "local_release");
});
