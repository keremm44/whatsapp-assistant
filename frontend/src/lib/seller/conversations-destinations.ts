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

/**
 * Active return/issue → Returns workspace, exact request.
 *
 * The backend's `seller_action_required` decides which operational
 * view owns the request: false stays in Bilgi Toplanıyor; true opens
 * İncelenecekler. The frontend does not recreate that decision from
 * the raw status string.
 */
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
 *
 * `?order=` is the established detail-selection contract. The backend
 * `seller_action_required` decides collecting vs action-required; no
 * external-order-number lookup and no invented `/seller/orders/{id}`
 * route are needed.
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
