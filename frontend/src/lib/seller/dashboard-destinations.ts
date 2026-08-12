/**
 * Dashboard task destinations.
 *
 * One centralized, pure helper so PriorityCard / CompactTaskCard /
 * SecondaryRow never drift. Destinations use only already-supported
 * seller workspaces — never an invented detail route.
 *
 *   return_review       → Returns workspace, action queue, exact request
 *   unanswered_question → Unanswered workspace, action queue, exact group
 *   order_review        → Orders list (V1 has no order detail workbench
 *                         and the task does not carry an order number)
 */

import type { DashboardTask } from "./dashboard-tasks.ts";
import { returnsWorkspaceHref } from "./returns-format.ts";
import { unansweredWorkspaceHref } from "./unanswered-format.ts";

export const dashboardTaskHref = (task: DashboardTask): string => {
  switch (task.type) {
    case "return_review":
      return returnsWorkspaceHref({
        view: "action_required",
        query: null,
        issueType: null,
        requestId: task.actionTarget.id,
      });
    case "unanswered_question":
      return unansweredWorkspaceHref({
        view: "action_required",
        questionId: task.actionTarget.id,
      });
    case "order_review":
      return "/seller/orders";
  }
};
