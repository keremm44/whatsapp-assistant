import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Standard page header rhythm used by every seller page in this macro pass.
 *
 * Title is the human, action-oriented name of the page (e.g. "Bugün
 * ilgilenmeniz gerekenler"). Description is a single short sentence that
 * tells the seller what this surface is for.
 *
 * A right-aligned `actions` slot is reserved for safe navigation only in
 * this step. Business actions (filters, add buttons, etc.) arrive when the
 * backend contract is wired in later steps.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1">
        <h1 className="font-heading text-2xl text-foreground sm:text-[28px]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
