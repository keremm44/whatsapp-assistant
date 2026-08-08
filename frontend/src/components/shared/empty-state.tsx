import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Calm empty state. Used wherever a list or detail region has no data yet
 * (this entire macro pass). The default presentation is restrained:
 * a small caption, a single message line, and an optional sub-line. No
 * "Add first item" CTAs, no illustrations, no AI imagery.
 */
export function EmptyState({
  caption,
  title,
  description,
  className,
}: {
  /** Short uppercase-style word would be wrong here; use a single label. */
  caption?: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 px-6 py-12 text-center",
        className,
      )}
    >
      {caption ? (
        <p className="text-xs text-muted-foreground">{caption}</p>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
