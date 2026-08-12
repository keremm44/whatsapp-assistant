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
  conversationTimelinesOverlap,
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

const idsOf = (rows: readonly ConversationMessage[]): number[] =>
  rows.map((row) => row.id);

test("overlap requires at least one shared message id", () => {
  assert.equal(
    conversationTimelinesOverlap([message(98), message(99), message(100)], [
      message(100),
      message(101),
    ]),
    true,
  );
  assert.equal(
    conversationTimelinesOverlap([message(98), message(99), message(100)], [
      message(102),
      message(103),
    ]),
    false,
  );
  assert.equal(conversationTimelinesOverlap([message(1)], []), false);
  assert.equal(conversationTimelinesOverlap([], [message(1)]), false);
});

test("same-customer merge keeps older history in front of the server page", () => {
  const previous = [message(1), message(2), message(3), message(4)];
  const next = [message(3), message(4), message(5)];
  const merged = reconcileSameCustomerMessages(previous, next);
  assert.deepEqual(idsOf(merged), [1, 2, 3, 4, 5]);
  // Overlap takes the server copy.
  assert.equal(merged[2]?.content, "msg-3");
});

test("same-customer merge does not invent a reorder", () => {
  const previous = [message(8), message(3), message(5)];
  const next = [message(5), message(9)];
  const merged = reconcileSameCustomerMessages(previous, next);
  assert.deepEqual(idsOf(merged), [8, 3, 5, 9]);
});

test("overlapping server copies replace stale local copies of the same id", () => {
  const previous = [message(3, { content: "stale-3" }), message(4)];
  const next = [message(3, { content: "fresh-3" }), message(4), message(5)];
  const merged = reconcileSameCustomerMessages(previous, next);
  assert.equal(merged[0]?.content, "fresh-3");
  assert.deepEqual(idsOf(merged), [3, 4, 5]);
});

test("merged ids never contain duplicates", () => {
  const previous = [message(1), message(2), message(3)];
  const next = [message(2), message(3), message(4)];
  const merged = reconcileSameCustomerMessages(previous, next);
  assert.equal(new Set(idsOf(merged)).size, merged.length);
});

test("empty server page is a disconnected window and does not keep local history", () => {
  const previous = [message(1), message(2)];
  assert.deepEqual(idsOf(reconcileSameCustomerMessages(previous, [])), []);
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
  assert.deepEqual(idsOf(result.messages), [80, 81]);
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
  assert.deepEqual(idsOf(result.messages), [1, 2, 3, 4, 5]);
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
  assert.deepEqual(idsOf(result.messages), [10, 11, 12]);
  assert.equal(result.messagePage, nextPage);
});

test("same-customer no-overlap reset uses the new server page and cursor", () => {
  const nextPage = page({ nextBeforeMessageId: 102, hasMore: true });
  const result = reconcileConversationTimeline({
    previousCustomerId: 22,
    nextCustomerId: 22,
    previousMessages: [message(98), message(99), message(100)],
    nextMessages: [message(102), message(103), message(151)],
    previousMessagePage: page({ nextBeforeMessageId: 1, hasMore: true }),
    nextMessagePage: nextPage,
  });
  assert.equal(result.didReset, true);
  assert.deepEqual(idsOf(result.messages), [102, 103, 151]);
  assert.equal(result.messagePage, nextPage);
  assert.equal(new Set(idsOf(result.messages)).size, result.messages.length);
  assert.equal(result.messages.some((row) => row.id === 100), false);
  assert.equal(result.messages.some((row) => row.id === 101), false);
});

test("same-customer empty server page resets to the empty server window", () => {
  const nextPage = page({ nextBeforeMessageId: null, hasMore: false });
  const result = reconcileConversationTimeline({
    previousCustomerId: 22,
    nextCustomerId: 22,
    previousMessages: [message(1), message(2)],
    nextMessages: [],
    previousMessagePage: page({ nextBeforeMessageId: 1, hasMore: true }),
    nextMessagePage: nextPage,
  });
  assert.equal(result.didReset, true);
  assert.deepEqual(idsOf(result.messages), []);
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

test("no-overlap reset drops disconnected anchors and uses the server time", () => {
  const previous = new Map<number, number>([
    [98, 1111],
    [99, 1111],
    [100, 1111],
  ]);
  const next = assignMessageTimestampAnchors({
    previousCustomerId: 22,
    nextCustomerId: 22,
    previousAnchors: previous,
    messageIds: [102, 103, 151],
    serverMessageIds: new Set([102, 103, 151]),
    serverRenderedAt: 5000,
    fetchRenderedAt: 9000,
  });
  assert.equal(next.has(98), false);
  assert.equal(next.has(99), false);
  assert.equal(next.has(100), false);
  assert.equal(next.get(102), 5000);
  assert.equal(next.get(103), 5000);
  assert.equal(next.get(151), 5000);
});
