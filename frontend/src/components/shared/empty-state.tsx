import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Calm empty state. Used wherever a region has no data yet.
 *
 * Two variants:
 *   - "default" — centered, comfortable padding. Used inside a bounded
 *     working surface (e.g. the conversation list column).
 *   - "compact" — left-aligned, headless. Used for ordinary macro pages
 *     that should not be wrapped in a giant bordered card.
 */
export function EmptyState({
  caption,
  title,
  description,
  variant = "default",
  className,
}: {
  /** Small quiet label, sentence case. */
  caption?: string;
  title: string;
  description?: string;
  variant?: "default" | "compact";
  className?: string;
}) {
  if (variant === "compact") {
    return (
      <div className={cn("space-y-1.5 py-6", className)}>
        {caption ? (
          <p className="type-meta text-muted-foreground">{caption}</p>
        ) : null}
        <p className="type-row-primary text-foreground">{title}</p>
        {description ? (
          <p className="max-w-md type-body text-muted">{description}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 px-6 py-10 text-center",
        className,
      )}
    >
      {caption ? (
        <p className="type-meta text-muted-foreground">{caption}</p>
      ) : null}
      <p className="type-row-primary text-foreground">{title}</p>
      {description ? (
        <p className="max-w-md type-body text-muted">{description}</p>
      ) : null}
    </div>
  );
}
