import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * The canonical PAPER WORK SHEET.
 *
 * This is NOT a card gallery entry: it is a quiet bounded region
 * meaning "work lives here". It uses the paper material, the 6px
 * sheet radius, a hairline boundary edge and a soft ambient shadow
 * that lifts it one step off the canvas so a panel reads as a
 * working plane rather than a flat patch of the field. Hard
 * elevation and interactive lift belong only to components that
 * genuinely float or that are themselves clickable (`work-card`).
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
        "rounded-sheet bg-raised shadow-surface border border-boundary/60",
        className,
      )}
    >
      {children}
    </Component>
  );
}
