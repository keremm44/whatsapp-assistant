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
 * Tone and spacing establish the region. Borders and elevation belong to
 * components that genuinely need a hard boundary, not every work area.
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
        "rounded-md bg-surface",
        className,
      )}
    >
      {children}
    </Component>
  );
}
