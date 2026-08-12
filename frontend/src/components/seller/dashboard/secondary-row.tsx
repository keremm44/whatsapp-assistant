import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  ChevronRight,
  MessagesSquare,
  Package,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import type { DashboardTask, DashboardTaskType } from "@/lib/seller/dashboard-tasks";
import { dashboardTaskHref } from "@/lib/seller/dashboard-destinations";
import { composeCustomerLine, formatUpdatedAt } from "@/lib/seller/dashboard-format";

/**
 * Compact "bugün bakılabilecekler" row used in the right-hand
 * column when BOTH high and normal groups are populated. The
 * row carries a 3px type rail so the brand colour is visible
 * in the side column too. The whole row is a single Link with
 * min-h-[56px] and the chevron appears on hover/focus.
 *
 * When the normal region is the only region (high=0), the
 * dashboard uses `CompactTaskCard` instead, which gives each
 * item more horizontal space and a more readable summary.
 */
const TYPE_META: Record<
  DashboardTaskType,
  {
    label: string;
    icon: LucideIcon;
    rail: "primary" | "review" | "neutral";
  }
> = {
  return_review: {
    label: "İade",
    icon: Undo2,
    rail: "review",
  },
  order_review: {
    label: "Sipariş",
    icon: Package,
    rail: "primary",
  },
  unanswered_question: {
    label: "Yanıt bekleyen",
    icon: MessagesSquare,
    rail: "neutral",
  },
};

const RAIL_CLASS: Record<"primary" | "review" | "neutral", string> = {
  primary: "bg-primary",
  review: "bg-accent",
  neutral: "bg-muted-foreground/50",
};

export function SecondaryRow({ task }: { task: DashboardTask }) {
  const meta = TYPE_META[task.type];
  const { icon: Icon } = meta;
  const customerLine = composeCustomerLine(task.customer);
  const updatedAtLabel = formatUpdatedAt(task.updatedAt);
  const href = dashboardTaskHref(task) as Route;
  const accessibleName = `${meta.label} — ${task.title}`;

  return (
    <li className="relative border-b border-divider last:border-b-0">
      <span
        aria-hidden="true"
        className={`absolute inset-y-3 left-0 w-[2px] rounded-full ${RAIL_CLASS[meta.rail]}`}
      />
      <Link
        href={href}
        aria-label={accessibleName}
        className="group flex min-h-[60px] items-start gap-3 px-4 py-3.5 pl-5 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset sm:px-5"
      >
        <Icon
          aria-hidden="true"
          size={18}
          strokeWidth={1.6}
          className="mt-0.5 shrink-0 text-muted-foreground group-hover:text-foreground"
        />
        <div className="min-w-0 flex-1 space-y-0.5">
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
          <p
            className="line-clamp-2 text-[14px] leading-snug text-foreground"
            title={task.title}
          >
            {task.title}
          </p>
          {customerLine ? (
            <p
              className="truncate text-[12.5px] text-muted-foreground"
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