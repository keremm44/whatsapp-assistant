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
import { composeCustomerLine, formatUpdatedAt } from "@/lib/seller/dashboard-format";

/**
 * The compact "bugün bakılabilecekler" row.
 *
 * Visual character:
 *   - Entire row is a single Link. The whole line is tappable
 *     (44px+ target) but no CTA copy is shown at rest; the
 *     chevron appears on hover/focus to indicate the action
 *     affordance.
 *   - Reads as a quiet, hand-written entry, not as a row in a
 *     data table. The category glyph on the left is small
 *     (16px), sentence case, in muted ink.
 *   - Customer meta line is preserved (`name · whatsapp`) but
 *     truncated at the second line on long titles via
 *     `line-clamp` so the row never exceeds two visual lines
 *     in the side panel.
 *
 * Data accessibility:
 *   The visible title and customer line are clamped to keep
 *   the row calm, but the full backend text is always
 *   available via the HTML `title` attribute on the relevant
 *   element. Long-press or hover on mobile / desktop surfaces
 *   reveals the complete text.
 *
 * Semantic labelling:
 *   The relative timestamp is rendered as "Güncelleme · X saat
 *   önce" (or shorter) so the user never reads the bare
 *   phrase as "waiting N hours". If the backend's
 *   `updated_at` is unparseable, the meta line is just the
 *   category label.
 *
 * The row's destination mirrors the parent task type's
 * canonical list route. We do not invent detail routes.
 */

const TYPE_META: Record<
  DashboardTaskType,
  { label: string; icon: LucideIcon; href: Route }
> = {
  return_review: {
    label: "İade",
    icon: Undo2,
    href: "/seller/returns",
  },
  order_review: {
    label: "Sipariş",
    icon: Package,
    href: "/seller/orders",
  },
  unanswered_question: {
    label: "Yanıt bekleyen",
    icon: MessagesSquare,
    href: "/seller/unanswered",
  },
};

export function SecondaryRow({ task }: { task: DashboardTask }) {
  const meta = TYPE_META[task.type];
  const { icon: Icon } = meta;
  const customerLine = composeCustomerLine(task.customer);
  const updatedAtLabel = formatUpdatedAt(task.updatedAt);
  const accessibleName = `${meta.label} — ${task.title}`;

  return (
    <li className="border-b border-divider last:border-b-0">
      <Link
        href={meta.href}
        aria-label={accessibleName}
        className="group flex min-h-[56px] items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset sm:px-5"
      >
        <Icon
          aria-hidden="true"
          size={16}
          strokeWidth={1.6}
          className="mt-0.5 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {meta.label}
            {updatedAtLabel ? (
              <>
                <span aria-hidden="true" className="mx-1.5 text-divider">
                  ·
                </span>
                <span
                  className="normal-case tracking-normal text-muted-foreground/80"
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
