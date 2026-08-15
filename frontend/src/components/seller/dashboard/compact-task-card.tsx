import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  MessagesSquare,
  Package,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import type { DashboardTask, DashboardTaskType } from "@/lib/seller/dashboard-tasks";
import { dashboardTaskHref } from "@/lib/seller/dashboard-destinations";
import { composeCustomerLine, formatUpdatedAt } from "@/lib/seller/dashboard-format";


/**
 * Compact task card used by the dashboard's "Bugün
 * bakılabilecekler" region when that region is rendered at
 * full width (the "high=0" case). It is the same anatomy as
 * `PriorityCard` but tighter: smaller icon, single-line meta,
 * and a more compact CTA. It still carries the type rail so
 * the brand colour is visible across the page.
 *
 * The `PriorityCard` is used for high-priority work; this is
 * its lower-weight sibling for normal-priority work that
 * needs a card rather than a row.
 */
const TYPE_META: Record<
  DashboardTaskType,
  {
    label: string;
    icon: LucideIcon;
    rail: "primary" | "review" | "neutral";
    cta: string;
  }
> = {
  return_review: {
    label: "İade incelemesi",
    icon: Undo2,
    rail: "review",
    cta: "İade listesine git",
  },
  order_review: {
    label: "Sipariş incelemesi",
    icon: Package,
    rail: "primary",
    cta: "Sipariş listesine git",
  },
  unanswered_question: {
    label: "Yanıt bekleyen soru",
    icon: MessagesSquare,
    rail: "neutral",
    cta: "Sorulara git",
  },
};

const RAIL_CLASS: Record<"primary" | "review" | "neutral", string> = {
  primary: "bg-primary",
  review: "bg-accent",
  neutral: "bg-muted-foreground/50",
};

export function CompactTaskCard({ task }: { task: DashboardTask }) {
  const meta = TYPE_META[task.type];
  const { icon: Icon } = meta;
  const customerLine = composeCustomerLine(task.customer);
  const updatedAtLabel = formatUpdatedAt(task.updatedAt);
  const hasSummary = task.summary.trim().length > 0;
  const href = dashboardTaskHref(task) as Route;
  const accessibleName = `${meta.label} — ${task.title} — ${meta.cta}`;

  return (
    <article className="group relative bg-surface transition-colors hover:bg-surface-2/60">
      <span
        aria-hidden="true"
        className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${RAIL_CLASS[meta.rail]}`}
      />
      <div className="flex items-start gap-3.5 p-3.5 pl-4.5 sm:p-4 sm:pl-5">
        <Icon aria-hidden="true" size={18} strokeWidth={1.6} className="mt-1 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-text">
            <span>{meta.label}</span>
            {updatedAtLabel ? (
              <>
                <span aria-hidden="true" className="text-divider">·</span>
                <span
                  className="font-medium normal-case tracking-normal text-muted-foreground"
                  title={updatedAtLabel}
                >
                  {updatedAtLabel}
                </span>
              </>
            ) : null}
          </p>
          <h3
            className="font-heading text-base font-semibold leading-snug text-foreground"
            title={task.title}
          >
            {task.title}
          </h3>
          {hasSummary ? (
            <p
              className="line-clamp-2 text-sm leading-relaxed text-muted"
              title={task.summary}
            >
              {task.summary}
            </p>
          ) : null}
          {customerLine ? (
            <p
              className="truncate pt-0.5 text-xs leading-relaxed text-muted-foreground"
              title={customerLine}
            >
              {customerLine}
            </p>
          ) : null}
        </div>
        <Link
          href={href}
          aria-label={accessibleName}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 self-start rounded-sm px-2 text-xs font-medium text-foreground transition-colors hover:bg-primary-muted/70 hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-9"
        >
          <span className="hidden sm:inline">{meta.cta}</span>
          <ArrowUpRight
            aria-hidden="true"
            size={14}
            strokeWidth={1.75}
            className="text-muted-foreground transition-colors group-hover:text-primary"
          />
        </Link>
      </div>
    </article>
  );
}