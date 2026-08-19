import * as React from "react";

import { cn } from "@/lib/utils/cn";

type StoryThreadTone = "neutral" | "attention";

/**
 * Small structural breadcrumb that makes the same product story continue
 * across distant marketing sections without relying on one fragile page-wide
 * SVG/path. The rail stays neutral; coral is allowed only on a real seller-
 * attention node.
 */
export function StoryThreadMarker({
  step,
  label,
  detail,
  tone = "neutral",
  className,
}: {
  step: string;
  label: string;
  detail?: string;
  tone?: StoryThreadTone;
  className?: string;
}) {
  const attention = tone === "attention";

  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-3",
        className,
      )}
      aria-label={`${step}. ${label}${detail ? `: ${detail}` : ""}`}
    >
      <div aria-hidden="true" className="flex shrink-0 flex-col items-center">
        <span
          className={cn(
            "flex h-7 min-w-7 items-center justify-center rounded-full border px-1 type-meta font-semibold",
            attention
              ? "border-attention bg-attention-soft text-attention"
              : "border-boundary bg-sunken text-muted-foreground",
          )}
        >
          {step}
        </span>
        <span className="h-5 w-px bg-divider" />
      </div>

      <div className="min-w-0 pt-0.5">
        <p
          className={cn(
            "type-meta font-semibold",
            attention ? "text-attention" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        {detail ? (
          <p className="mt-0.5 type-row-secondary text-muted">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}
