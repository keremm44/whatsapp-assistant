import * as React from "react";
import { ListChecks } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";

/**
 * The dashboard's page header.
 *
 * Composition:
 *   - The existing shared `PageHeader` is rendered unchanged on
 *     the left (caption + title + description + petrol hairline).
 *     We do not fork it.
 *   - On the right we render a quiet factual count badge. The
 *     count is the backend-provided `toplam` aggregate. The
 *     badge explicitly says "İlgilenmeniz gereken N konu" so the
 *     user understands what the number represents.
 *
 *   The badge is deliberately NOT labeled "Bugün" or anything
 *   that would imply a date scope the backend does not provide.
 *   `toplam` is the total count of the current action queue; it
 *   is not a "today" aggregate.
 *
 * On viewports narrower than `sm` the badge drops below the
 * title block so the two never compete for horizontal space.
 */
export function DashboardHeader({
  total,
  caption = "Genel Bakış",
  title = "Bugün ilgilenmeniz gerekenler",
  description = "Satıcı müdahalesi isteyen konular burada öncelik sırasıyla görünecek.",
}: {
  /** The backend-provided `toplam` aggregate. */
  total: number;
  caption?: string;
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-5 pb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
      <PageHeader
        caption={caption}
        title={title}
        description={description}
        className="pb-0"
      />
      {total > 0 ? <CountBadge total={total} /> : null}
    </div>
  );
}

/**
 * Small factual count badge.
 *
 * Shows "İlgilenmeniz gereken N konu" with a checkmark glyph so
 * the user can see at a glance how many items are waiting in
 * the queue. The numeral is in `tabular-nums` so the count
 * does not jitter on re-render.
 */
function CountBadge({ total }: { total: number }) {
  return (
    <div
      role="status"
      aria-label={`İlgilenmeniz gereken ${total} konu`}
      className="flex w-fit items-center gap-2.5 self-start rounded-md border border-border bg-chrome px-3.5 py-2 sm:self-auto"
    >
      <span
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary-muted text-primary"
      >
        <ListChecks size={14} strokeWidth={1.6} />
      </span>
      <p className="flex items-baseline gap-1.5 text-[13px] leading-none text-foreground">
        <span className="text-foreground/80">İlgilenmeniz gereken</span>
        <span className="tabular-nums font-semibold text-foreground">
          {total}
        </span>
        <span className="text-muted-foreground">konu</span>
      </p>
    </div>
  );
}
