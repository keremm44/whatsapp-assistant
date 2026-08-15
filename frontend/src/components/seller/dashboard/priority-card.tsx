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
 * The high-priority task card.
 *
 * Visual identity (this pass):
 *
 *   - A single working surface (white, 1px warm border,
 *     rounded-md). The card has a 4px-wide left rail keyed
 *     to the backend task TYPE — petrol for order_review,
 *     clay for return_review, neutral for unanswered_question.
 *     The rail is the most visible piece of brand colour on
 *     the page (alongside the petrol hairline under the
 *     page header). It tells the seller at a glance which
 *     type of work is sitting on the desk.
 *
 *   - The icon field is 40x40 in the type's soft surface
 *     with a slightly stronger icon. The icon is the same
 *     size as the row icons used elsewhere (18px) for
 *     rhythm.
 *
 *   - The category caption is uppercase, 11px, petrol.
 *     The "Güncelleme · X" meta strip sits on the same
 *     line as the caption, in muted ink. The full updated_at
 *     phrase is available via the title attribute.
 *
 *   - The title is Manrope medium, 16-17px. The summary is
 *     always rendered without visual truncation; the full
 *     text is always accessible.
 *
 *   - The customer meta line (name · whatsapp) sits below
 *     the summary in a slightly lifted ink colour. When the
 *     customer is null (unanswered_question branch) the
 *     line is omitted.
 *
 *   - Action. The right side shows a small directional link
 *     with the destination verb ("İade listesine git" etc.)
 *     and a subtle arrow. The element is at least 44px tall
 *     on touch screens and 36px on tablet+ where a mouse is
 *     the primary input. The link is the only interactive
 *     surface on the card.
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

export function PriorityCard({ task }: { task: DashboardTask }) {
  const meta = TYPE_META[task.type];
  const { icon: Icon } = meta;
  const customerLine = composeCustomerLine(task.customer);
  const updatedAtLabel = formatUpdatedAt(task.updatedAt);
  const hasSummary = task.summary.trim().length > 0;
  const href = dashboardTaskHref(task) as Route;
  const accessibleName = `${meta.label} — ${task.title} — ${meta.cta}`;

  return (
    <article className="group relative bg-surface transition-colors hover:bg-surface-2/60">
      {/* Type rail — the single most visible brand cue on the page. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-4 left-0 w-[3px] rounded-r-full ${RAIL_CLASS[meta.rail]}`}
      />
      {/* Narrow mobile: icon + content own the full row width and the
          CTA moves BELOW the content so long titles/summaries are
          never squeezed by the reserved link width. From sm up the
          familiar compact right-side CTA arrangement returns. */}
      <div className="flex flex-col gap-3 p-4 pl-5 sm:flex-row sm:items-start sm:gap-5 sm:p-5 sm:pl-6">
        <div className="flex min-w-0 items-start gap-4 sm:flex-1 sm:gap-5">
          <Icon aria-hidden="true" size={20} strokeWidth={1.6} className="mt-1 shrink-0 text-muted-foreground" />

          <div className="min-w-0 flex-1 space-y-2">
          <CategoryCaption label={meta.label} updatedAt={updatedAtLabel} />
          <h3
            className="font-heading text-base font-semibold leading-snug text-foreground"
            title={task.title}
          >
            {task.title}
          </h3>
          {hasSummary ? (
            <p
              className="text-sm leading-relaxed text-muted"
              title={task.summary}
            >
              {task.summary}
            </p>
          ) : null}
            {customerLine ? (
              <p
                className="pt-0.5 text-[13px] leading-relaxed text-foreground/70"
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
          className="inline-flex h-11 shrink-0 items-center gap-1.5 self-start rounded-sm px-2 text-[13px] font-medium text-foreground transition-colors hover:bg-primary-muted/70 hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-9"
        >
          <span>{meta.cta}</span>
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

function CategoryCaption({
  label,
  updatedAt,
}: {
  label: string;
  updatedAt: string | null;
}) {
  if (!updatedAt) {
    return (
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-text">
        {label}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-text">
      <span>{label}</span>
      <span aria-hidden="true" className="text-divider">·</span>
      <span
        className="font-medium normal-case tracking-normal text-muted-foreground"
        title={updatedAt}
      >
        {updatedAt}
      </span>
    </p>
  );
}