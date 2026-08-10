import * as React from "react";

/**
 * Two-column dashboard layout (>= lg) and single-column mobile
 * layout (< lg). The high-priority column is the primary
 * reading order; the secondary column carries the
 * "bugün bakılabilecekler" list and the quiet summary panel.
 *
 * On viewports narrower than `lg` the columns stack into a
 * single vertical flow in the same order, so the seller
 * continues to see "Önce bunlar" first.
 *
 * The grid widths are intentionally chosen so the high-priority
 * column gets about 60% of the available content width on a
 * 1280px viewport, leaving the right column at about 32% with
 * a comfortable gap. This is not a three-column CRM.
 */
export function DashboardLayout({
  primary,
  secondary,
  summary,
}: {
  primary: React.ReactNode;
  secondary: React.ReactNode;
  summary: React.ReactNode;
}) {
  return (
    <div className="mt-8 flex flex-col gap-10 lg:mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-5">{primary}</div>
      <aside className="flex flex-col gap-6 lg:sticky lg:top-20">
        {secondary}
        {summary}
      </aside>
    </div>
  );
}
