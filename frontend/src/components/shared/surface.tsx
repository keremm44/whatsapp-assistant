import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * The canonical "white work surface" used in the seller panel.
 *
 * Per the design philosophy, this is NOT a card per se — it is a quiet
 * region that visually means "this is a place containing actionable
 * information". The shell uses linen as the surrounding background so
 * these surfaces read as working areas.
 *
 * Use sparingly: a page should typically have one or two surfaces, not a
 * grid of equal-weight cards. If a region is purely structural, prefer
 * a heading + divider instead.
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
        "rounded-md border border-border bg-surface",
        className,
      )}
    >
      {children}
    </Component>
  );
}
