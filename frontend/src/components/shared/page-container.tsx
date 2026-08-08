import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Centered, max-width working container for seller pages.
 *
 * Desktop: 32px horizontal padding.
 * Tablet:  24px.
 * Mobile:  16px.
 *
 * The maximum readable working width is 1280px so a single surface never
 * stretches across a 4K display. The seller shell already provides the
 * sidebar and topbar chrome, so this only constrains the content area.
 */
export function PageContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1280px]",
        "px-4 md:px-6 lg:px-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
