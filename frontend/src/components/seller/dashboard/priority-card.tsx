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
 * Visual character:
 *   - A single working surface (white, 1px warm border, soft
 *     shadow, rounded-md). It reads as a calm piece of paper on
 *     the seller's desk, not as a notification card.
 *   - The icon field on the left anchors the row and gives the
 *     category (return / order / unanswered) an immediate,
 *     typographic-feeling reading. The tone is keyed to the
 *     backend task type, NOT to the priority field.
 *   - The right side shows a quiet text CTA. The title is the
 *     heaviest element on the card; the CTA is a sıcak outline
 *     with an arrow and never competes with the title.
 *   - There is no pill. The category is communicated by the
 *     icon field, with a small uppercase caption beneath the
 *     icon on wide viewports and a meta strip near the title on
 *     narrow ones.
 *   - The customer meta line shows `name · whatsapp` when both
 *     are present (per the proven SQL nullability), only `name`
 *     when only that is present, and is omitted entirely when
 *     the customer is null (`unanswered_question` branch).
 *   - The meta strip shows "Güncelleme · X saat önce" when a
 *     parseable `updated_at` is available. The "Güncelleme"
 *     label is required so the user never reads the bare
 *     relative phrase as "waiting N hours". If the timestamp is
 *     unparseable, the line is omitted.
 *
 * Data accessibility:
 *   - The full summary text is exposed via the HTML `title`
 *     attribute on the summary paragraph so users can read
 *     the complete context without truncation. The visible
 *     line is wrapped with a soft 2-line clamp on mobile so
 *     the card stays compact, but the full text is always one
 *     hover / long-press away.
 *   - The card itself is NOT a Link. The CTA on the right is
 *     the link, with a single accessible name. The whole card
 *     has a hover border accent for affordance, but the click
 *     target is only the CTA.
 *
 * Mobile touch targets:
 *   The CTA is at least 44px tall on viewports narrower than
 *   `sm` (we use `h-11` = 44px) and shrinks to `h-9` (36px) on
 *   tablet+ where a mouse is the primary input. This matches
 *   the dashboard's commitment that every interactive element
 *   is comfortable on touch.
 */

const TYPE_META: Record<
  DashboardTaskType,
  {
    label: string;
    icon: LucideIcon;
    tone: IconFieldTone;
    href: Route;
    cta: string;
  }
> = {
  return_review: {
    label: "İade incelemesi",
    icon: Undo2,
    tone: "review",
    href: "/seller/returns",
    cta: "İade listesine git",
  },
  order_review: {
    label: "Sipariş incelemesi",
    icon: Package,
    tone: "primary",
    href: "/seller/orders",
    cta: "Sipariş listesine git",
  },
  unanswered_question: {
    label: "Yanıt bekleyen soru",
    icon: MessagesSquare,
    tone: "neutral",
    href: "/seller/unanswered",
    cta: "Sorulara git",
  },
};

export function PriorityCard({ task }: { task: DashboardTask }) {
  const meta = TYPE_META[task.type];
  const { icon: Icon } = meta;
  const customerLine = composeCustomerLine(task.customer);
  const updatedAtLabel = formatUpdatedAt(task.updatedAt);
  const hasSummary = task.summary.trim().length > 0;
  const accessibleName = `${meta.label} — ${task.title} — ${meta.cta}`;

  return (
    <article className="group relative rounded-md border border-border bg-surface shadow-surface transition-colors hover:border-primary/30">
      <div className="flex items-start gap-4 p-4 sm:gap-5 sm:p-5">
        <div className="flex flex-col items-center gap-2 pt-0.5">
          <IconField icon={Icon} tone={meta.tone} />
          <span
            aria-hidden="true"
            className="hidden h-6 w-px bg-divider sm:block"
          />
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
          className="inline-flex h-11 shrink-0 items-center gap-1.5 self-start rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:h-9"
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

/**
 * The category caption that sits at the top of each card's
 * content block. When the backend provides a parseable
 * `updated_at`, the caption shows the category plus a quiet
 * "Güncelleme · X" separator so the user understands what the
 * relative time refers to. The label is part of the same
 * string and is never split; the gap between category and
 * timestamp is purely visual.
 */
function CategoryCaption({
  label,
  updatedAt,
}: {
  label: string;
  updatedAt: string | null;
}) {
  if (!updatedAt) {
    return (
      <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
      <span>{label}</span>
      <span aria-hidden="true" className="text-divider">·</span>
      <span
        className="normal-case tracking-normal text-muted-foreground/80"
        title={updatedAt}
      >
        {updatedAt}
      </span>
    </p>
  );
}
