/**
 * Conversations context-rail destinations.
 *
 * Related-record ids and primary-action signals come from the backend.
 * The rail opens the existing URL-owned workspaces on the exact record;
 * it never invents a route or recreates business rules from status text.
 */

import { ordersListHref } from "./orders-format.ts";
import { returnsWorkspaceHref } from "./returns-format.ts";
import { unansweredWorkspaceHref } from "./unanswered-format.ts";

/** Active return/issue → Returns workspace, exact request. */
export const conversationReturnDestination = (issue: {
  id: number;
  sellerActionRequired: boolean;
}): string =>
  returnsWorkspaceHref({
    view: issue.sellerActionRequired ? "action_required" : "collecting",
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
 * Active order → existing Orders workbench, exact selected order.
 * `?order=` is the established detail-selection contract; there is no
 * `/seller/orders/{id}` page route.
 */
export const conversationOrderDestination = (order: {
  id: number;
  sellerActionRequired: boolean;
}): string =>
  ordersListHref({
    view: order.sellerActionRequired ? "action_required" : "collecting",
    query: null,
    orderId: order.id,
  });
