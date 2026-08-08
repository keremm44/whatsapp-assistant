import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Centered, max-width working container for seller pages.
 *
 * The default `size="default"` is approximately 1180px, which is a
 * comfortable reading/work width for most seller surfaces. The
 * `size="wide"` variant allows up to 1280px and is reserved for
 * list/detail workflows (e.g. /seller/conversations) that genuinely
 * benefit from more horizontal space.
 *
 * Horizontal padding:
 *   Mobile:  16px
 *   Tablet:  24px
 *   Desktop: 32px
 */
export function PageContainer({
  className,
  size = "default",
  children,
}: {
  className?: string;
  size?: "default" | "wide";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        size === "wide" ? "max-w-[1280px]" : "max-w-[1180px]",
        "px-4 md:px-6 lg:px-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
