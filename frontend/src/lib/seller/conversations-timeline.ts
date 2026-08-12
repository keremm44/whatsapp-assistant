/**
 * Conversations timeline helpers — timestamp anchors and same-customer
 * history reconciliation.
 *
 * Pure, environment-neutral, zero-runtime-import (types only) so the
 * Node built-in test runner can verify the rules without a DOM.
 */

import type {
  ConversationMessage,
  ConversationMessagePage,
} from "./conversations";

/* ------------------------------------------------------------------ */
/* Same-customer refresh / history preservation                        */
/* ------------------------------------------------------------------ */

/**
 * Merge a freshly resolved newest page with already-loaded older
 * history for the SAME customer.
 *
 * The server page is the authoritative newest window. Messages the
 * seller already loaded that are not in that window stay in place,
 * in their original relative order, in front of the server page.
 * Overlapping ids take the server copy. Nothing is re-sorted.
 */
export const reconcileSameCustomerMessages = (
  previous: readonly ConversationMessage[],
  next: readonly ConversationMessage[],
): ConversationMessage[] => {
  if (next.length === 0) {
    return [...previous];
  }
  const nextIds = new Set(next.map((message) => message.id));
  const older = previous.filter((message) => !nextIds.has(message.id));
  return [...older, ...next];
};

export type ConversationTimelineReconcileInput = {
  previousCustomerId: number | null;
  nextCustomerId: number;
  previousMessages: readonly ConversationMessage[];
  nextMessages: readonly ConversationMessage[];
  previousMessagePage: ConversationMessagePage;
  nextMessagePage: ConversationMessagePage;
};

export type ConversationTimelineReconcileResult = {
  messages: ConversationMessage[];
  messagePage: ConversationMessagePage;
  didReset: boolean;
};

/**
 * Re-seed the timeline when the server payload changes.
 *
 *   different customer → full reset to that customer's server page
 *   same customer      → keep already-loaded older history; adopt the
 *                        newest server page; keep the older-page cursor
 *                        so “Daha eski mesajları yükle” does not rewind
 */
export const reconcileConversationTimeline = (
  input: ConversationTimelineReconcileInput,
): ConversationTimelineReconcileResult => {
  if (input.previousCustomerId !== input.nextCustomerId) {
    return {
      messages: [...input.nextMessages],
      messagePage: input.nextMessagePage,
      didReset: true,
    };
  }

  const messages = reconcileSameCustomerMessages(
    input.previousMessages,
    input.nextMessages,
  );
  const keptOlder = messages.length > input.nextMessages.length;
  return {
    messages,
    messagePage: keptOlder ? input.previousMessagePage : input.nextMessagePage,
    didReset: false,
  };
};

/* ------------------------------------------------------------------ */
/* Stable relative-time anchors                                        */
/* ------------------------------------------------------------------ */

/**
 * Assign a frozen relative-time anchor to each visible message.
 *
 *   - switching customer resets every anchor to the server renderedAt
 *   - already-assigned anchors never move when another page is loaded
 *   - newly arrived server-page messages use the server renderedAt
 *   - newly arrived older-page messages use that page's fetch time
 */
export const assignMessageTimestampAnchors = (input: {
  previousCustomerId: number | null;
  nextCustomerId: number;
  previousAnchors: ReadonlyMap<number, number>;
  messageIds: readonly number[];
  serverMessageIds: ReadonlySet<number>;
  serverRenderedAt: number;
  fetchRenderedAt: number;
}): Map<number, number> => {
  if (input.previousCustomerId !== input.nextCustomerId) {
    const next = new Map<number, number>();
    for (const id of input.messageIds) {
      next.set(id, input.serverRenderedAt);
    }
    return next;
  }

  const next = new Map<number, number>();
  for (const id of input.messageIds) {
    const existing = input.previousAnchors.get(id);
    if (existing !== undefined) {
      next.set(id, existing);
      continue;
    }
    next.set(
      id,
      input.serverMessageIds.has(id)
        ? input.serverRenderedAt
        : input.fetchRenderedAt,
    );
  }
  return next;
};
