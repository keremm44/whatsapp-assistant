import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import type { DashboardTask } from "@/lib/seller/dashboard-tasks";
import { dashboardTaskHref } from "@/lib/seller/dashboard-destinations";
import {
  composeCustomerLine,
  formatUpdatedAt,
} from "@/lib/seller/dashboard-format";

import { DASHBOARD_TASK_PRESENTATION } from "./task-presentation";

/**
 * A high-priority entry in "Önce bunlar".
 *
 * This is NOT a card. In the Working Ledger direction the high
 * section is one contiguous paper work sheet whose entries are
 * separated by rules; this component renders one generous ruled row
 * inside it. There is no per-row border, no per-row radius, no
 * per-row shadow and no per-row background — those would rebuild the
 * card gallery the pilot is replacing.
 *
 * Anatomy (unchanged information, restructured):
 *   icon + type label   what kind of work this is (type = icon/label,
 *                       never colour)
 *   attention flag      oxide, and ONLY when the backend type
 *                       genuinely means seller review/intervention
 *   title               the record identity line
 *   summary             the backend summary, never truncated visually
 *   customer/context    name · whatsapp, omitted when the backend
 *                       carries no customer
 *   updated at          quiet metadata
 *   destination action  one clear action per row
 *
 * Mobile: the action stacks BELOW the content so long titles are
 * never squeezed; the compact side arrangement returns at sm+. The
 * action keeps a 44px touch target on mobile.
 */
export function PriorityCard({ task }: { task: DashboardTask }) {
  const meta = DASHBOARD_TASK_PRESENTATION[task.type];
  const { icon: Icon } = meta;
  const customerLine = composeCustomerLine(task.customer);
  const updatedAtLabel = formatUpdatedAt(task.updatedAt);
  const hasSummary = task.summary.trim().length > 0;
  const href = dashboardTaskHref(task) as Route;
  const accessibleName = `${meta.label} — ${task.title} — ${meta.cta}`;

  return (
    <article className="group relative transition-colors hover:bg-elevated/50">
      <div className="flex flex-col gap-3 p-4 pl-5 sm:flex-row sm:items-start sm:gap-5 sm:p-5 sm:pl-6">
        <div className="flex min-w-0 items-start gap-4 sm:flex-1 sm:gap-5">
          <Icon
            aria-hidden="true"
            size={20}
            strokeWidth={1.6}
            className="mt-1 shrink-0 text-muted-foreground"
          />

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
              {/* Oxide seller-attention flag. Present only for backend
                  review types; never decorative. */}
              {meta.sellerReview && meta.attentionLabel ? (
                <span className="inline-flex items-center gap-1.5 type-meta font-semibold text-attention">
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-attention"
                  />
                  {meta.attentionLabel}
                </span>
              ) : null}
            </div>
            <h3
              className="type-record-identity text-foreground"
              title={task.title}
            >
              {task.title}
            </h3>
            {hasSummary ? (
              <p className="type-body text-muted" title={task.summary}>
                {task.summary}
              </p>
            ) : null}
            {customerLine ? (
              <p
                className="type-row-secondary text-muted-foreground"
                title={customerLine}
              >
                {customerLine}
              </p>
            ) : null}
          </div>
        </div>

        <Link
          href={href}
          aria-label={accessibleName}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 self-start rounded-control px-2 type-row-secondary font-semibold text-primary transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:h-9"
        >
          <span>{meta.cta}</span>
          <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.9} />
        </Link>
      </div>
    </article>
  );
}
