/**
 * Konuşma geçmişi presentation tests (`conversations-format.ts`).
 *
 * Runs with Node's built-in test runner:
 *   node --test src/lib/seller/conversations-format.test.ts
 * (via `npm test`)
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { ConversationControlHistoryEntry } from "./conversations.ts";
import {
  CONTROL_HISTORY_INITIAL_COUNT,
  CONTROL_HISTORY_SHOW_LESS_LABEL,
  CONTROL_HISTORY_SHOW_MORE_LABEL,
  CONTROL_HISTORY_TITLE,
  CONTROL_STATE_HISTORY_LABELS,
  getControlHistoryEntryDisplay,
  hasConversationContext,
} from "./conversations-format.ts";

const entry = (
  overrides: Partial<ConversationControlHistoryEntry> = {},
): ConversationControlHistoryEntry => ({
  id: 91,
  fromState: "ASSISTANT_ACTIVE",
  toState: "SELLER_TAKEN_OVER",
  reasonCode: "seller_manual_takeover",
  reasonNote: null,
  changedByProfileId: 7,
  triggerMessageId: 1201,
  resumeAfterMessageId: null,
  previousVersion: 3,
  newVersion: 4,
  createdAt: "2026-08-14T12:00:00+00:00",
  ...overrides,
});

/* ------------------------------------------------------------------ */
/* State labels + transition text                                      */
/* ------------------------------------------------------------------ */

test("all four backend control states map to the approved Turkish labels", () => {
  assert.deepEqual(CONTROL_STATE_HISTORY_LABELS, {
    ASSISTANT_ACTIVE: "Asistan aktif",
    SELLER_TAKEN_OVER: "Siz ilgileniyorsunuz",
    RETURN_REVIEW: "İade incelemesi",
    ASSISTANT_PAUSED: "Yanıtlar durduruldu",
  });
});

test("a transition renders as 'from → to' in seller language", () => {
  assert.equal(
    getControlHistoryEntryDisplay(entry()).transition,
    "Asistan aktif → Siz ilgileniyorsunuz",
  );
  assert.equal(
    getControlHistoryEntryDisplay(
      entry({ fromState: "ASSISTANT_PAUSED", toState: "ASSISTANT_ACTIVE" }),
    ).transition,
    "Yanıtlar durduruldu → Asistan aktif",
  );
  assert.equal(
    getControlHistoryEntryDisplay(
      entry({ fromState: "RETURN_REVIEW", toState: "SELLER_TAKEN_OVER" }),
    ).transition,
    "İade incelemesi → Siz ilgileniyorsunuz",
  );
});

/* ------------------------------------------------------------------ */
/* Reason note                                                         */
/* ------------------------------------------------------------------ */

test("a real reason note is returned trimmed; absence is never filled", () => {
  assert.equal(
    getControlHistoryEntryDisplay(
      entry({ reasonNote: "  Müşteriyle manuel olarak ilgilenilecek.  " }),
    ).note,
    "Müşteriyle manuel olarak ilgilenilecek.",
  );
  // whitespace-only and null → omitted, no fabricated "Sebep belirtilmedi".
  assert.equal(getControlHistoryEntryDisplay(entry({ reasonNote: "   " })).note, null);
  assert.equal(getControlHistoryEntryDisplay(entry({ reasonNote: null })).note, null);
});

/* ------------------------------------------------------------------ */
/* Technical leakage                                                   */
/* ------------------------------------------------------------------ */

test("the seller-facing projection never surfaces technical fields", () => {
  const record = entry({
    reasonCode: "security_violation_code",
    changedByProfileId: 4242,
    triggerMessageId: 987654,
    resumeAfterMessageId: 987655,
    previousVersion: 11,
    newVersion: 12,
  });
  const display = getControlHistoryEntryDisplay(record);
  // The projection has exactly two seller-facing keys.
  assert.deepEqual(Object.keys(display).sort(), ["note", "transition"]);
  const rendered = `${display.transition} ${display.note ?? ""}`;
  assert.equal(rendered.includes("security_violation_code"), false);
  assert.equal(rendered.includes("4242"), false);
  assert.equal(rendered.includes("987654"), false);
  assert.equal(rendered.includes("11"), false);
  assert.equal(rendered.includes("12"), false);
  // No actor identity is fabricated from any field.
  assert.doesNotMatch(rendered, /yaptı|yaptınız|Satıcı|Admin|Sistem/);
});

/* ------------------------------------------------------------------ */
/* Context visibility (rail / Bağlam sheet)                            */
/* ------------------------------------------------------------------ */

test("control history alone is enough for conversation context to exist", () => {
  assert.equal(
    hasConversationContext({
      activeOrder: null,
      activeReturnIssue: null,
      openUnanswered: [],
      controlHistory: [entry()],
    }),
    true,
  );
});

test("everything empty — including history — means no context", () => {
  assert.equal(
    hasConversationContext({
      activeOrder: null,
      activeReturnIssue: null,
      openUnanswered: [],
      controlHistory: [],
    }),
    false,
  );
  // Existing business-context rules are unchanged.
  assert.equal(
    hasConversationContext({
      activeOrder: { id: 1 },
      activeReturnIssue: null,
      openUnanswered: [],
      controlHistory: [],
    }),
    true,
  );
  assert.equal(
    hasConversationContext({
      activeOrder: null,
      activeReturnIssue: null,
      openUnanswered: [{ id: 5 }],
      controlHistory: [],
    }),
    true,
  );
});

/* ------------------------------------------------------------------ */
/* Compact-amount copy                                                 */
/* ------------------------------------------------------------------ */

test("expansion copy never claims a complete lifetime history", () => {
  assert.equal(CONTROL_HISTORY_TITLE, "Konuşma geçmişi");
  assert.equal(CONTROL_HISTORY_INITIAL_COUNT, 5);
  assert.equal(CONTROL_HISTORY_SHOW_MORE_LABEL, "Daha fazlasını göster");
  assert.equal(CONTROL_HISTORY_SHOW_LESS_LABEL, "Daha az göster");
  assert.doesNotMatch(CONTROL_HISTORY_SHOW_MORE_LABEL, /Tüm|Eksiksiz/);
});
