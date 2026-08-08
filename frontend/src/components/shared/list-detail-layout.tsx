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
 */
export function ListDetailLayout({
  list,
  detail,
  listWidthClassName = "lg:w-[360px] xl:w-[380px]",
  showDetailOnMobile = false,
  className,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
  /** Tailwind class controlling the list column width on lg+ viewports. */
  listWidthClassName?: string;
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
        "flex flex-col gap-4 lg:flex-row lg:items-start",
        className,
      )}
    >
      <div
        className={cn(
          "lg:shrink-0 lg:border-r lg:border-border lg:pr-4",
          listWidthClassName,
        )}
      >
        {list}
      </div>
      <div
        className={cn(
          "min-w-0 flex-1 lg:pl-2",
          showDetailOnMobile ? "block" : "hidden lg:block",
        )}
      >
        {detail}
      </div>
    </div>
  );
}
