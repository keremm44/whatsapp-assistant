/**
 * Conversations timeline helper tests (`conversations-timeline.ts`).
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/seller/conversations-timeline.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  ConversationMessage,
  ConversationMessagePage,
} from "./conversations.ts";
import {
  assignMessageTimestampAnchors,
  reconcileConversationTimeline,
  reconcileSameCustomerMessages,
} from "./conversations-timeline.ts";

const message = (
  id: number,
  overrides: Partial<ConversationMessage> = {},
): ConversationMessage => ({
  id,
  direction: "incoming",
  content: `msg-${id}`,
  messageType: "text",
  wasAutoReplied: false,
  mediaAvailable: false,
  createdAt: `2026-08-10T12:00:${String(id).padStart(2, "0")}+00:00`,
  ...overrides,
});

const page = (
  overrides: Partial<ConversationMessagePage> = {},
): ConversationMessagePage => ({
  limit: 50,
  hasMore: true,
  nextBeforeMessageId: 10,
  ...overrides,
});

test("same-customer merge keeps older history in front of the server page", () => {
  const previous = [message(1), message(2), message(3), message(4)];
  const next = [message(3), message(4), message(5)];
  const merged = reconcileSameCustomerMessages(previous, next);
  assert.deepEqual(
    merged.map((row) => row.id),
    [1, 2, 3, 4, 5],
  );
  // Overlap takes the server copy.
  assert.equal(merged[2]?.content, "msg-3");
});

test("same-customer merge does not invent a reorder", () => {
  const previous = [message(8), message(3), message(5)];
  const next = [message(5), message(9)];
  const merged = reconcileSameCustomerMessages(previous, next);
  assert.deepEqual(
    merged.map((row) => row.id),
    [8, 3, 5, 9],
  );
});

test("same-customer merge is a no-op when the server page is empty", () => {
  const previous = [message(1), message(2)];
  assert.deepEqual(
    reconcileSameCustomerMessages(previous, []).map((row) => row.id),
    [1, 2],
  );
});

test("different customer fully resets to the new server payload", () => {
  const result = reconcileConversationTimeline({
    previousCustomerId: 22,
    nextCustomerId: 33,
    previousMessages: [message(1), message(2), message(3)],
    nextMessages: [message(80), message(81)],
    previousMessagePage: page({ nextBeforeMessageId: 1, hasMore: true }),
    nextMessagePage: page({ nextBeforeMessageId: 80, hasMore: false }),
  });
  assert.equal(result.didReset, true);
  assert.deepEqual(
    result.messages.map((row) => row.id),
    [80, 81],
  );
  assert.equal(result.messagePage.nextBeforeMessageId, 80);
  assert.equal(result.messagePage.hasMore, false);
});

test("same-customer refresh keeps older history and the older-page cursor", () => {
  const previousPage = page({ nextBeforeMessageId: 1, hasMore: true });
  const result = reconcileConversationTimeline({
    previousCustomerId: 22,
    nextCustomerId: 22,
    previousMessages: [message(1), message(2), message(3), message(4)],
    nextMessages: [message(3), message(4), message(5)],
    previousMessagePage: previousPage,
    nextMessagePage: page({ nextBeforeMessageId: 3, hasMore: true }),
  });
  assert.equal(result.didReset, false);
  assert.deepEqual(
    result.messages.map((row) => row.id),
    [1, 2, 3, 4, 5],
  );
  assert.equal(result.messagePage, previousPage);
});

test("same-customer first page with no older history adopts the server cursor", () => {
  const nextPage = page({ nextBeforeMessageId: 10, hasMore: true });
  const result = reconcileConversationTimeline({
    previousCustomerId: 22,
    nextCustomerId: 22,
    previousMessages: [message(10), message(11)],
    nextMessages: [message(10), message(11), message(12)],
    previousMessagePage: page({ nextBeforeMessageId: 10, hasMore: true }),
    nextMessagePage: nextPage,
  });
  assert.equal(result.didReset, false);
  assert.deepEqual(
    result.messages.map((row) => row.id),
    [10, 11, 12],
  );
  assert.equal(result.messagePage, nextPage);
});

test("switching customer resets every timestamp anchor to the server time", () => {
  const previous = new Map<number, number>([
    [1, 1000],
    [2, 1000],
  ]);
  const next = assignMessageTimestampAnchors({
    previousCustomerId: 22,
    nextCustomerId: 33,
    previousAnchors: previous,
    messageIds: [80, 81],
    serverMessageIds: new Set([80, 81]),
    serverRenderedAt: 5000,
    fetchRenderedAt: 9000,
  });
  assert.deepEqual([...next.entries()], [
    [80, 5000],
    [81, 5000],
  ]);
});

test("already-loaded older messages keep their original timestamp anchor", () => {
  const previous = new Map<number, number>([
    [1, 1111],
    [2, 1111],
    [3, 1000],
    [4, 1000],
  ]);
  const next = assignMessageTimestampAnchors({
    previousCustomerId: 22,
    nextCustomerId: 22,
    previousAnchors: previous,
    messageIds: [1, 2, 3, 4, 5],
    serverMessageIds: new Set([3, 4, 5]),
    serverRenderedAt: 1000,
    fetchRenderedAt: 2222,
  });
  assert.equal(next.get(1), 1111);
  assert.equal(next.get(2), 1111);
  assert.equal(next.get(3), 1000);
  assert.equal(next.get(4), 1000);
  assert.equal(next.get(5), 1000);
});

test("a newly fetched older page shares one stable fetch timestamp", () => {
  const previous = new Map<number, number>([
    [10, 1000],
    [11, 1000],
  ]);
  const next = assignMessageTimestampAnchors({
    previousCustomerId: 22,
    nextCustomerId: 22,
    previousAnchors: previous,
    messageIds: [8, 9, 10, 11],
    serverMessageIds: new Set([10, 11]),
    serverRenderedAt: 1000,
    fetchRenderedAt: 3333,
  });
  assert.equal(next.get(8), 3333);
  assert.equal(next.get(9), 3333);
  assert.equal(next.get(10), 1000);
  assert.equal(next.get(11), 1000);
});
