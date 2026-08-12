/**
 * Conversations context-rail destinations.
 *
 * The detail payload already carries the real ids. The rail must use
 * them to open the existing workspaces — never invent a detail route
 * and never dump the seller on a broad list when a precise URL exists.
 */

import type { ConversationReturnIssueStatus } from "./conversations.ts";
import { ordersListHref } from "./orders-format.ts";
import { returnsWorkspaceHref } from "./returns-format.ts";
import { unansweredWorkspaceHref } from "./unanswered-format.ts";

/**
 * Active return/issue → Returns workspace, exact request.
 *
 * Status decides the view: COLLECTING is not a seller-review item, so
 * it must open Bilgi Toplanıyor. SELLER_REVIEW_REQUIRED stays on the
 * default İncelenecekler queue. The helper never invents a third
 * status or a detail route.
 */
export const conversationReturnDestination = (issue: {
  id: number;
  status: ConversationReturnIssueStatus;
}): string => {
  switch (issue.status) {
    case "COLLECTING":
      return returnsWorkspaceHref({
        view: "collecting",
        query: null,
        issueType: null,
        requestId: issue.id,
      });
    case "SELLER_REVIEW_REQUIRED":
      return returnsWorkspaceHref({
        view: "action_required",
        query: null,
        issueType: null,
        requestId: issue.id,
      });
  }
};

/** Open unanswered group → Unanswered workspace, exact question. */
export const conversationUnansweredDestination = (group: {
  id: number;
}): string =>
  unansweredWorkspaceHref({
    view: "action_required",
    questionId: group.id,
  });

/**
 * Active order → existing Orders list. When the marketplace order
 * number is present, use the exact search the list already supports.
 * There is no approved `/seller/orders/{id}` workbench in V1.
 */
export const conversationOrderDestination = (order: {
  externalOrderNumber: string | null;
}): string => {
  const number = order.externalOrderNumber;
  if (typeof number === "string" && number.trim().length > 0) {
    return ordersListHref({ view: "all", query: number.trim() });
  }
  return "/seller/orders";
};
