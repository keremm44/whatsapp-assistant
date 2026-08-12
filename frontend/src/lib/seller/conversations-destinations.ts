/**
 * Conversations context-rail destinations.
 *
 * The detail payload already carries the real ids. The rail must use
 * them to open the existing workspaces — never invent a detail route
 * and never dump the seller on a broad list when a precise URL exists.
 */

import { ordersListHref } from "./orders-format.ts";
import { returnsWorkspaceHref } from "./returns-format.ts";
import { unansweredWorkspaceHref } from "./unanswered-format.ts";

/** Active return/issue → Returns workspace, exact request. */
export const conversationReturnDestination = (issue: {
  id: number;
}): string =>
  returnsWorkspaceHref({
    view: "action_required",
    query: null,
    issueType: null,
    requestId: issue.id,
  });

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
