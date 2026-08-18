import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Branded, non-circular loading mark.
 *
 * Three narrow signal rails give long waits a little visual life without
 * becoming a distracting progress promise. Cyan remains interaction,
 * iris carries product character, and the third rail stays neutral so
 * semantic warning/attention colours are never borrowed as decoration.
 * Motion is disabled for reduced-motion users.
 */
export function LoadingSignal({
  className,
  label = "Yükleniyor",
  compact = false,
}: {
  className?: string;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn("inline-flex items-center gap-3", className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex items-end justify-center gap-1 overflow-hidden rounded-control border border-boundary/60 bg-sunken shadow-inset",
          compact ? "h-7 w-14 px-2 py-1.5" : "h-10 w-[72px] px-2.5 py-2",
        )}
      >
        <span
          className={cn(
            "w-1 origin-bottom rounded-[2px] bg-primary motion-safe:animate-pulse motion-reduce:animate-none",
            compact ? "h-2.5" : "h-4",
          )}
        />
        <span
          className={cn(
            "w-1 origin-bottom rounded-[2px] bg-brand motion-safe:animate-pulse motion-reduce:animate-none [animation-delay:180ms]",
            compact ? "h-4" : "h-6",
          )}
        />
        <span
          className={cn(
            "w-1 origin-bottom rounded-[2px] bg-foreground/35 motion-safe:animate-pulse motion-reduce:animate-none [animation-delay:360ms]",
            compact ? "h-3" : "h-5",
          )}
        />
        <span className="absolute inset-x-2 bottom-1 h-px bg-gradient-to-r from-primary/65 via-brand/60 to-transparent" />
      </span>
      {!compact ? (
        <span className="type-meta text-muted-foreground">{label}</span>
      ) : null}
    </div>
  );
}
