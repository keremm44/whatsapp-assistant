import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { StatusChip } from "@/components/shared/status-chip";
import type { DashboardTask } from "@/lib/seller/dashboard-tasks";
import { dashboardTaskHref } from "@/lib/seller/dashboard-destinations";
import {
  composeCustomerLine,
  formatUpdatedAt,
} from "@/lib/seller/dashboard-format";

import { DASHBOARD_TASK_PRESENTATION } from "./task-presentation";

/**
 * The quiet compact ledger row used for "Bugün bakılabilecekler" in
 * the side column (the case where BOTH priority groups are
 * populated).
 *
 * It is the lightest row in the docket: type icon + type label, a
 * single line of metadata, the title, and the customer/context line.
 * The whole row is one Link with a real 60px target and the chevron
 * appears on hover/focus.
 *
 * No colour rail. Type is icon + label; the only colour a dashboard
 * row may spend is oxide, and only for backend seller-review types —
 * which normal-priority rows are not.
 */
export function SecondaryRow({ task }: { task: DashboardTask }) {
  const meta = DASHBOARD_TASK_PRESENTATION[task.type];
  const { icon: Icon } = meta;
  const customerLine = composeCustomerLine(task.customer);
  const updatedAtLabel = formatUpdatedAt(task.updatedAt);
  const href = dashboardTaskHref(task) as Route;
  const accessibleName = `${meta.label} — ${task.title}`;

  return (
    <li className="relative border-b border-divider last:border-b-0">
      <Link
        href={href}
        aria-label={accessibleName}
        className="group flex min-h-[60px] items-start gap-3 px-4 py-3.5 transition-colors hover:bg-elevated/50 focus-visible:bg-elevated/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset sm:px-5"
      >
        <Icon
          aria-hidden="true"
          size={18}
          strokeWidth={1.6}
          className="mt-0.5 shrink-0 text-muted-foreground group-hover:text-foreground"
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
            <span className="type-meta text-muted-foreground">
              {meta.label}
            </span>
            {updatedAtLabel ? (
              <span
                className="type-meta text-muted-foreground"
                title={updatedAtLabel}
              >
                {updatedAtLabel}
              </span>
            ) : null}
            {meta.sellerReview && meta.attentionLabel ? (
              <StatusChip tone="attention">{meta.attentionLabel}</StatusChip>
            ) : null}
          </div>
          <p
            className="line-clamp-2 type-row-primary text-foreground"
            title={task.title}
          >
            {task.title}
          </p>
          {customerLine ? (
            <p
              className="truncate type-meta text-muted-foreground"
              title={customerLine}
            >
              {customerLine}
            </p>
          ) : null}
        </div>
        <ChevronRight
          aria-hidden="true"
          size={16}
          strokeWidth={1.5}
          className="mt-2 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </Link>
    </li>
  );
}
