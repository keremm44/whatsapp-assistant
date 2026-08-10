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

export function PriorityCard({ task }: { task: DashboardTask }) {
  const meta = TYPE_META[task.type];
  const { icon: Icon } = meta;
  const customerLine = composeCustomerLine(task.customer);
  const updatedAtLabel = formatUpdatedAt(task.updatedAt);
  const hasSummary = task.summary.trim().length > 0;
  const accessibleName = `${meta.label} — ${task.title} — ${meta.cta}`;

  return (
    <article className="group relative overflow-hidden rounded-md border border-border bg-surface shadow-surface transition-colors hover:border-primary/40">
      {/* Type rail — the single most visible brand cue on the page. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${RAIL_CLASS[meta.rail]}`}
      />
      <div className="flex items-start gap-4 p-4 pl-5 sm:gap-5 sm:p-5 sm:pl-6">
        <div className="flex flex-col items-center gap-2 pt-0.5">
          <IconField icon={Icon} tone={meta.tone} size={40} />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <CategoryCaption label={meta.label} updatedAt={updatedAtLabel} />
          <h3
            className="font-heading text-[16px] font-medium leading-snug text-foreground sm:text-[17px]"
            title={task.title}
          >
            {task.title}
          </h3>
          {hasSummary ? (
            <p
              className="text-sm leading-relaxed text-muted-foreground"
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

        <Link
          href={meta.href}
          aria-label={accessibleName}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 self-start rounded-md border border-border bg-surface px-3.5 text-[13px] font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:h-9"
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
        {label}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
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