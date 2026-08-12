/**
 * Paused queue presentation tests (`paused-format.ts`).
 *
 * Runs with Node's built-in test runner:
 *   node --test src/lib/seller/paused-format.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  conversationDetailHref,
  describeMessagePreview,
  getConversationCustomerDisplay,
  MEDIA_MESSAGE_LABEL,
} from "./conversations-format.ts";
import {
  getPausedReasonLabel,
  getPausedReasonNote,
  PAUSED_EMPTY_COPY,
  PAUSED_OPEN_CONVERSATION_LABEL,
  PAUSED_STATE_LABEL,
  pausedConversationHref,
} from "./paused-format.ts";

test("approved reason codes map to locked seller-facing labels", () => {
  assert.equal(
    getPausedReasonLabel("manual_pause"),
    "Sizin tarafınızdan durduruldu",
  );
  assert.equal(
    getPausedReasonLabel("security"),
    "Güvenlik nedeniyle durduruldu",
  );
  assert.equal(
    getPausedReasonLabel("violation"),
    "Müşteri davranışı nedeniyle durduruldu",
  );
});

test("unknown or missing reason codes fall back to the generic state only", () => {
  assert.equal(getPausedReasonLabel("future_code"), null);
  assert.equal(getPausedReasonLabel("PAUSE"), null);
  assert.equal(getPausedReasonLabel(null), null);
  assert.equal(getPausedReasonLabel(""), null);
  assert.equal(PAUSED_STATE_LABEL, "Yanıtlar durduruldu");
});

test("reason notes stay quiet and never duplicate the mapped label", () => {
  assert.equal(getPausedReasonNote("  Müşteri rica etti  ", null), "Müşteri rica etti");
  assert.equal(
    getPausedReasonNote("Sizin tarafınızdan durduruldu", "Sizin tarafınızdan durduruldu"),
    null,
  );
  assert.equal(getPausedReasonNote("   ", "Sizin tarafınızdan durduruldu"), null);
  assert.equal(getPausedReasonNote(null, "Sizin tarafınızdan durduruldu"), null);
});

test("customer identity prefers name and falls back to the WhatsApp number", () => {
  assert.deepEqual(
    getConversationCustomerDisplay({
      name: "Elif",
      whatsappNumber: "+905321112233",
    }),
    { primary: "Elif", secondary: "+905321112233" },
  );
  assert.deepEqual(
    getConversationCustomerDisplay({
      name: null,
      whatsappNumber: "+905321112233",
    }),
    { primary: "+905321112233", secondary: null },
  );
  assert.deepEqual(
    getConversationCustomerDisplay({ name: "  ", whatsappNumber: null }),
    { primary: "Müşteri", secondary: null },
  );
});

test("media preview reuses the Conversations marker", () => {
  const preview = describeMessagePreview({
    id: 9,
    direction: "incoming",
    content: null,
    messageType: "image",
    wasAutoReplied: false,
    mediaAvailable: true,
    createdAt: "2026-08-10T12:00:00+00:00",
  });
  assert.equal(preview.isMedia, true);
  assert.equal(preview.text, null);
  assert.equal(MEDIA_MESSAGE_LABEL, "Medya mesajı");
});

test("the only destination is the existing conversation detail route", () => {
  assert.equal(pausedConversationHref(22), "/seller/conversations/22");
  assert.equal(pausedConversationHref(22), conversationDetailHref(22, false));
  assert.equal(pausedConversationHref(22).includes("/seller/paused"), false);
  assert.equal(PAUSED_OPEN_CONVERSATION_LABEL, "Konuşmayı aç");
});

test("empty copy is calm and not celebratory", () => {
  assert.equal(PAUSED_EMPTY_COPY.title, "Yanıtı durdurulan konuşma yok");
  assert.match(PAUSED_EMPTY_COPY.description, /burada görünecek/);
});
