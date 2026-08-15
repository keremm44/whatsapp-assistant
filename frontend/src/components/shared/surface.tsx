import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * The canonical PAPER WORK SHEET.
 *
 * This is NOT a card: it is a quiet region meaning "work lives here".
 * It uses the paper material, the 6px sheet radius, and no shadow.
 * The mineral canvas behind it does the separating. Borders and
 * elevation belong only to components that genuinely need a hard
 * boundary or that truly float.
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
        "rounded-sheet bg-paper",
        className,
      )}
    >
      {children}
    </Component>
  );
}
