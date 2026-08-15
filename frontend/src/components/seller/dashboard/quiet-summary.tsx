import * as React from "react";

import { buildDashboardQuietSummary } from "@/lib/seller/dashboard-summary";
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
 * When the fetched page is complete (`tasks.length === total`)
 * the three numbers are the truthful priority split plus the
 * global total. When the page is partial the component only
 * reports how many rows are shown versus the real global total
 * — it never presents first-page high/normal counts as if they
 * were global.
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
  const model = buildDashboardQuietSummary({ tasks, total });
  const rows =
    model.kind === "complete"
      ? [
          { label: "Önce bakılacaklar", value: model.high },
          { label: "Vakit varsa", value: model.normal },
          { label: "Toplam", value: model.total, emphasize: true },
        ]
      : [
          { label: "Gösterilen", value: model.shown },
          { label: "Toplam", value: model.total, emphasize: true },
        ];

  if (layout === "side") {
    return (
      <section
        aria-labelledby="dashboard-quiet-summary"
        className="rounded-md bg-surface px-4 py-4 sm:px-5"
      >
        <div>
          <h3
            id="dashboard-quiet-summary"
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
          >
            Özet
          </h3>
          <dl className="mt-3 space-y-2">
            {rows.map((row, index) => (
              <React.Fragment key={row.label}>
                {row.emphasize && index > 0 ? (
                  <div className="my-1.5 h-px bg-divider" aria-hidden="true" />
                ) : null}
                <Row
                  label={row.label}
                  value={row.value}
                  emphasize={row.emphasize}
                />
              </React.Fragment>
            ))}
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
        {rows.map((row, index) => (
          <React.Fragment key={row.label}>
            {row.emphasize && index > 0 ? (
              <span
                aria-hidden="true"
                className="hidden h-3 w-px bg-divider sm:inline-block"
              />
            ) : null}
            <InlineRow
              label={row.label}
              value={row.value}
              emphasize={row.emphasize}
            />
          </React.Fragment>
        ))}
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
