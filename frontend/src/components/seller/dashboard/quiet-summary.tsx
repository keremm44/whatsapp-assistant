import * as React from "react";

import type { DashboardTaskPriority } from "@/lib/seller/dashboard-tasks";

/**
 * Quiet summary panel shown under the secondary list on the
 * right side of the dashboard.
 *
 * Data integrity:
 *   The only numbers shown here are derived directly from the
 *   already-loaded `tasks` array that the server-side page
 *   resolved from the backend. We do NOT make any additional
 *   requests and we do NOT compute time-based metrics ("waiting
 *   since X", "response time", etc.) that the backend does not
 *   explicitly surface.
 *
 * What it shows:
 *   - The count of high-priority rows the seller is seeing.
 *   - The count of normal-priority rows the seller is seeing.
 *   - The total. That is all. No extra task categories, no
 *     percentages, no waiting times, no inferred urgency.
 *
 * When the dashboard is empty this panel is not rendered.
 */
export function QuietSummary({
  tasks,
  total,
}: {
  tasks: { priority: DashboardTaskPriority }[];
  total: number;
}) {
  let high = 0;
  let normal = 0;
  for (const t of tasks) {
    if (t.priority === "high") high += 1;
    else normal += 1;
  }

  return (
    <section
      aria-labelledby="dashboard-quiet-summary"
      className="rounded-md border border-border bg-chrome/60 p-4 sm:p-5"
    >
      <h3
        id="dashboard-quiet-summary"
        className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        Özet
      </h3>
      <dl className="mt-3 space-y-2">
        <Row label="Önce bakılacaklar" value={high} />
        <Row label="Vakit varsa" value={normal} />
        <div className="my-2 h-px bg-divider" aria-hidden="true" />
        <Row label="Toplam" value={total} emphasize />
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
      <dt className={emphasize ? "font-medium text-foreground" : "text-foreground/80"}>
        {label}
      </dt>
      <dd
        className={
          emphasize
            ? "tabular-nums font-semibold text-foreground"
            : "tabular-nums text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}
