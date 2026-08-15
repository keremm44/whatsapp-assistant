import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Section heading for the dashboard's work regions.
 *
 * "The Working Ledger" pilot removes the decorative coloured rail and
 * the brand motif entirely: neither carried state, and colour in this
 * direction is reserved for interaction and seller attention.
 *
 * What replaces them is typographic rhythm — the section title in the
 * 24/30 section role, the count as quiet tabular metadata beside it,
 * and a calm description underneath. The heading sits directly on the
 * canvas, above its work sheet, the way a ruled ledger names a
 * column.
 */
export function SectionHeading({
  id,
  title,
  count,
  description,
  className,
}: {
  id: string;
  title: string;
  count?: number;
  description?: string;
  className?: string;
}) {
  return (
    <header className={cn("space-y-1", className)}>
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h2 id={id} className="type-section text-foreground">
          {title}
        </h2>
        {typeof count === "number" ? (
          <span
            aria-hidden="true"
            className="type-row-secondary tabular-nums text-muted-foreground"
          >
            {count}
          </span>
        ) : null}
      </div>
      {description ? (
        <p className="type-row-secondary text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  );
}
