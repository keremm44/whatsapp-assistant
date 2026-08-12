/**
 * Conversation list query + control-state filter helpers.
 *
 * Isolated from the fetch/parser module so Node's test runner can
 * verify the URL contract without resolving Next path aliases.
 */

import type { ConversationControlState } from "./conversations.ts";

export type ConversationListQueryInput = {
  attentionOnly?: boolean;
  controlState?: ConversationControlState;
  limit?: number;
  offset?: number;
};

/**
 * Build the list query string. Existing unfiltered callers stay
 * identical: `attention_only` is always written, `control_state`
 * appears only when a filter is requested.
 */
export const buildConversationListQuery = (
  options?: ConversationListQueryInput,
): string => {
  const query = new URLSearchParams();
  query.set(
    "attention_only",
    options?.attentionOnly === true ? "true" : "false",
  );
  if (options?.controlState !== undefined) {
    query.set("control_state", options.controlState);
  }
  if (typeof options?.limit === "number") {
    query.set("limit", String(options.limit));
  }
  if (typeof options?.offset === "number") {
    query.set("offset", String(options.offset));
  }
  return query.toString();
};

const CONTROL_STATES = new Set<string>([
  "ASSISTANT_ACTIVE",
  "SELLER_TAKEN_OVER",
  "RETURN_REVIEW",
  "ASSISTANT_PAUSED",
]);

/**
 * Parse the echoed `control_state` filter. Missing/null is “no
 * filter”. A present value must be an allowlisted control state.
 */
export const parseConversationControlStateFilter = (
  value: unknown,
): ConversationControlState | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && CONTROL_STATES.has(value)) {
    return value as ConversationControlState;
  }
  throw new Error("conversations_invalid_control_state");
};
