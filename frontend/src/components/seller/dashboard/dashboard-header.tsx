import * as React from "react";

/**
 * Dashboard header — the top of today's work docket.
 *
 * "The Working Ledger" pilot:
 *
 *   - The H1 is the page's serif title role (38/42 desktop, 32/36
 *     mobile). It, not a badge, is what gives the page its weight.
 *
 *   - The task count is now TYPOGRAPHIC, not a decorative badge: the
 *     numeral is set large in tabular figures on the same line of
 *     copy, as a docket would state its load. It is still the exact
 *     backend `toplam` aggregate, still wrapped in a single `<p>`
 *     with an explicit accessible phrase, and still omitted at zero.
 *
 *   - The previous uppercase petrol caption and the decorative brand
 *     hairline are gone. Neither carried state, and the pilot spends
 *     colour only on state.
 */
export function DashboardHeader({
  total,
  title = "Bugün ilgilenmeniz gerekenler",
  description = "Satıcı müdahalesi isteyen konular burada öncelik sırasıyla görünecek.",
}: {
  /** The backend-provided `toplam` aggregate. */
  total: number;
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-4 pb-7 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
      <div className="space-y-2.5">
        <h1 className="type-page-title text-foreground">{title}</h1>
        {description ? (
          <p className="max-w-2xl type-body text-muted">{description}</p>
        ) : null}
      </div>
      {total > 0 ? <WorkloadCount total={total} /> : null}
    </div>
  );
}

/**
 * Typographic workload statement. No badge, no fill, no icon — the
 * numeral itself carries the weight, in tabular figures so it does not
 * jitter across re-renders.
 */
function WorkloadCount({ total }: { total: number }) {
  return (
    <p
      role="status"
      aria-label={`İlgilenmeniz gereken ${total} konu`}
      className="flex shrink-0 items-baseline gap-2 self-start border-t border-divider pt-2 sm:self-auto sm:border-t-0 sm:pt-0"
    >
      <span
        aria-hidden="true"
        className="font-title text-[30px] font-semibold leading-none tabular-nums text-foreground"
      >
        {total}
      </span>
      <span aria-hidden="true" className="type-row-secondary text-muted">
        konu ilgilenmenizi bekliyor
      </span>
    </p>
  );
}
