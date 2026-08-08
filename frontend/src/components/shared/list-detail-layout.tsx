import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Two-region layout used by /seller/conversations: a fixed-width list
 * column on the left and a flexible detail column on the right.
 *
 * On desktop (>= lg) the two regions sit side by side. On tablet the
 * same column structure is preserved but with a smaller gap. On mobile,
 * the detail region is hidden by default because the detail lives in a
 * separate route (e.g. /seller/conversations/[customerId]). Consumers
 * that need the detail on mobile can opt in via `showDetailOnMobile`.
 *
 * The list and detail regions can carry different surface treatments
 * (e.g. `listSurface="chrome"` vs `detailSurface="surface"`) so the
 * list reads as a navigation/list region and the detail reads as the
 * actual working area. By default both use the primary working surface.
 */
export function ListDetailLayout({
  list,
  detail,
  listWidthClassName = "lg:w-[400px] xl:w-[420px]",
  listSurface,
  detailSurface,
  showDetailOnMobile = false,
  className,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
  /** Tailwind class controlling the list column width on lg+ viewports. */
  listWidthClassName?: string;
  /** Optional wrapper element for the list region. */
  listSurface?: React.ReactNode;
  /** Optional wrapper element for the detail region. */
  detailSurface?: React.ReactNode;
  className?: string;
  /**
   * Whether to show the detail region on mobile. Defaults to false.
   * The approved mobile behavior for the conversations macro is to
   * show only the list region; the detail region is reached via a
   * separate route introduced in a later step.
   */
  showDetailOnMobile?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6",
        className,
      )}
    >
      <div
        className={cn(
          "lg:shrink-0 lg:pr-1",
          listWidthClassName,
        )}
      >
        {listSurface ? listSurface : list}
      </div>
      <div
        className={cn(
          "min-w-0 flex-1",
          showDetailOnMobile ? "block" : "hidden lg:block",
        )}
      >
        {detailSurface ? detailSurface : detail}
      </div>
    </div>
  );
}
