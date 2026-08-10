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
import { composeCustomerLine, formatUpdatedAt } from "@/lib/seller/dashboard-format";

import { IconField, type IconFieldTone } from "./icon-field";

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
    tone: IconFieldTone;
    rail: "primary" | "review" | "neutral";
    href: Route;
    cta: string;
  }
> = {
  return_review: {
    label: "İade incelemesi",
    icon: Undo2,
    tone: "review",
    rail: "review",
    href: "/seller/returns",
    cta: "İade listesine git",
  },
  order_review: {
    label: "Sipariş incelemesi",
    icon: Package,
    tone: "primary",
    rail: "primary",
    href: "/seller/orders",
    cta: "Sipariş listesine git",
  },
  unanswered_question: {
    label: "Yanıt bekleyen soru",
    icon: MessagesSquare,
    tone: "neutral",
    rail: "neutral",
    href: "/seller/unanswered",
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
  const accessibleName = `${meta.label} — ${task.title} — ${meta.cta}`;

  return (
    <article className="group relative overflow-hidden rounded-md border border-border bg-surface shadow-surface transition-colors hover:border-primary/40">
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${RAIL_CLASS[meta.rail]}`}
      />
      <div className="flex items-start gap-3.5 p-3.5 pl-4.5 sm:p-4 sm:pl-5">
        <IconField icon={Icon} tone={meta.tone} size={40} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
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
            className="font-heading text-[15px] font-medium leading-snug text-foreground sm:text-[16px]"
            title={task.title}
          >
            {task.title}
          </h3>
          {hasSummary ? (
            <p
              className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground"
              title={task.summary}
            >
              {task.summary}
            </p>
          ) : null}
          {customerLine ? (
            <p
              className="truncate pt-0.5 text-[12.5px] leading-relaxed text-foreground/70"
              title={customerLine}
            >
              {customerLine}
            </p>
          ) : null}
        </div>
        <Link
          href={meta.href}
          aria-label={accessibleName}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 self-start rounded-md border border-border bg-surface px-3 text-[12.5px] font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:h-9"
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