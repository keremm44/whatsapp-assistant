import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * Small inline spinner. Used inside buttons and other in-place loading
 * states. The icon is animated with a CSS spin keyframe; no extra
 * dependency is required.
 */
export function Spinner({
  className,
  size = 16,
  label = "Yükleniyor",
}: {
  className?: string;
  size?: 14 | 16 | 18 | 20;
  /** Accessible label for screen readers. */
  label?: string;
}) {
  return (
    <Loader2
      className={cn("animate-spin", className)}
      size={size}
      strokeWidth={2}
      role="status"
      aria-label={label}
    />
  );
}
