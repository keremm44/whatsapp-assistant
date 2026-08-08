import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * The canonical "warm near-white work surface" used in the seller panel.
 *
 * Per the design philosophy, this is NOT a card per se — it is a quiet
 * region that visually means "this is a place containing actionable
 * information". The shell uses the linen cream as the surrounding
 * background so these surfaces read as working areas.
 *
 * A 1px warm border plus a very subtle surface shadow keep the
 * hierarchy perceptible without becoming a floating card.
 */
export function Surface({
  as: Tag = "div",
  className,
  children,
}: {
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  children: React.ReactNode;
}) {
  const Component = Tag as React.ElementType;
  return (
    <Component
      className={cn(
        "rounded-md border border-border bg-surface shadow-surface",
        className,
      )}
    >
      {children}
    </Component>
  );
}
