import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Two-region layout used by /seller/conversations: a fixed-width list
 * column on the left and a flexible detail column on the right. The
 * mobile pass collapses this to a single column.
 *
 * This is NOT a permanent three-column CRM layout.
 */
export function ListDetailLayout({
  list,
  detail,
  listWidthClassName = "lg:w-[360px] xl:w-[380px]",
  className,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
  /** Tailwind class controlling the list column width on lg+ viewports. */
  listWidthClassName?: string;
  className?: string;
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
      <div className="min-w-0 flex-1 lg:pl-2">{detail}</div>
    </div>
  );
}
