import * as React from "react";

import type { DashboardTaskPriority } from "@/lib/seller/dashboard-tasks";

/**
 * Quiet summary panel.
 *
 * Two presentations:
 *
 *   - Inline footer (used in scenarios B and C, where only
 *     one priority group has data). A single thin
 *     hairline + a horizontal "Özet" row that lists the
 *     two counts and the total. Compact, sits at the
 *     bottom of the page, no card chrome.
 *
 *   - Side panel (used in scenario A, where both groups
 *     have data and the side column is meaningful). A
 *     chrome-toned surface with a petrol top hairline,
 *     sits at the bottom of the side column.
 *
 * The two presentations render the same three numbers:
 * high count, normal count, total. No fabricated KPIs,
 * no waiting times, no inferred urgency.
 *
 * When the dashboard is empty (scenario D) the component
 * is not rendered.
 */
type Layout = "inline" | "side";

export function QuietSummary({
  tasks,
  total,
  layout,
}: {
  tasks: { priority: DashboardTaskPriority }[];
  total: number;
  layout: Layout;
}) {
  let high = 0;
  let normal = 0;
  for (const t of tasks) {
    if (t.priority === "high") high += 1;
    else normal += 1;
  }

  if (layout === "side") {
    return (
      <section
        aria-labelledby="dashboard-quiet-summary"
        className="relative overflow-hidden rounded-md border border-accent/30 bg-accent-muted/85"
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-accent"
        />
        <div className="p-4 sm:p-5">
          <h3
            id="dashboard-quiet-summary"
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-text"
          >
            Özet
          </h3>
          <dl className="mt-3 space-y-2">
            <Row label="Önce bakılacaklar" value={high} />
            <Row label="Vakit varsa" value={normal} />
            <div className="my-1.5 h-px bg-accent/15" aria-hidden="true" />
            <Row label="Toplam" value={total} emphasize />
          </dl>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="dashboard-quiet-summary"
      className="border-t border-divider pt-5 sm:pt-6"
    >
      <h3
        id="dashboard-quiet-summary"
        className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-text"
      >
        Özet
      </h3>
      <dl className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-2 text-[13px]">
        <InlineRow label="Önce bakılacaklar" value={high} />
        <InlineRow label="Vakit varsa" value={normal} />
        <span aria-hidden="true" className="hidden h-3 w-px bg-divider sm:inline-block" />
        <InlineRow label="Toplam" value={total} emphasize />
      </dl>
    </section>
  );
}

function Row({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <dt
        className={
          emphasize
            ? "font-medium text-foreground"
            : "text-foreground/80"
        }
      >
        {label}
      </dt>
      <dd
        className={
          emphasize
            ? "tabular-nums font-semibold text-primary-text"
            : "tabular-nums text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function InlineRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt
        className={
          emphasize
            ? "font-medium text-foreground"
            : "text-foreground/80"
        }
      >
        {label}
      </dt>
      <dd
        className={
          emphasize
            ? "tabular-nums text-[14px] font-semibold text-primary-text"
            : "tabular-nums text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}