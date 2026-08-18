import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Standard page header rhythm.
 *
 * The title now carries a short three-part signature rule: interaction
 * cyan, product iris and a quiet structural tail. It is intentionally
 * small enough to add identity and rhythm without turning headings into
 * state indicators or filling the workspace with colour.
 */
export function PageHeader({
  caption,
  title,
  description,
  actions,
  className,
}: {
  caption?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="space-y-2">
        {caption ? (
          <p className="type-meta text-muted-foreground">{caption}</p>
        ) : null}
        <h1 className="type-page-title text-foreground">{title}</h1>
        <span
          aria-hidden="true"
          className="flex h-1 items-center gap-1.5 pt-0.5"
        >
          <span className="h-0.5 w-8 rounded-pill bg-primary/80" />
          <span className="h-0.5 w-3 rounded-pill bg-brand/75" />
          <span className="h-px w-10 bg-divider" />
        </span>
        {description ? (
          <p className="max-w-2xl type-body text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
