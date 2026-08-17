import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { StatusChip } from "@/components/shared/status-chip";
import type { DashboardTask } from "@/lib/seller/dashboard-tasks";
import { dashboardTaskHref } from "@/lib/seller/dashboard-destinations";
import {
  composeCustomerLine,
  formatUpdatedAt,
} from "@/lib/seller/dashboard-format";

import { DASHBOARD_TASK_PRESENTATION } from "./task-presentation";

/**
 * A normal-priority ledger row at full page width (the "high = 0"
 * case).
 *
 * Quieter than the high-priority row in every dimension: smaller
 * icon, a single metadata line, tighter vertical rhythm, and a
 * summary clamped to two lines. It shares the same contiguous paper
 * work sheet and the same dividers — it is not an individual card,
 * and it carries no per-row border, radius or shadow.
 *
 * Normal-priority work is not seller intervention, so no oxide
 * appears here. The presentation map still gates that centrally:
 * `unanswered_question` (the only type the backend maps to normal)
 * has `sellerReview: false`.
 */
export function CompactTaskCard({ task }: { task: DashboardTask }) {
  const meta = DASHBOARD_TASK_PRESENTATION[task.type];
  const { icon: Icon } = meta;
  const customerLine = composeCustomerLine(task.customer);
  const updatedAtLabel = formatUpdatedAt(task.updatedAt);
  const hasSummary = task.summary.trim().length > 0;
  const href = dashboardTaskHref(task) as Route;
  const accessibleName = `${meta.label} — ${task.title} — ${meta.cta}`;

  return (
    <article className="group relative transition-colors hover:bg-elevated/50">
      <div className="flex items-start gap-3.5 p-4 sm:px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-boundary/40 bg-recessed text-muted-foreground transition-colors group-hover:bg-hover group-hover:text-foreground">
          <Icon aria-hidden="true" size={18} strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
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
          <h3 className="type-row-primary text-foreground" title={task.title}>
            {task.title}
          </h3>
          {hasSummary ? (
            <p
              className="line-clamp-2 type-row-secondary text-muted"
              title={task.summary}
            >
              {task.summary}
            </p>
          ) : null}
          {customerLine ? (
            <p
              className="truncate type-meta text-muted-foreground"
              title={customerLine}
            >
              {customerLine}
            </p>
          ) : null}
        </div>
        <Link
          href={href}
          aria-label={accessibleName}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 self-start rounded-control px-2 type-row-secondary font-medium text-primary transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:h-9"
        >
          <span className="hidden sm:inline">{meta.cta}</span>
          <ArrowUpRight
            aria-hidden="true"
            size={14}
            strokeWidth={1.9}
            className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </article>
  );
}
