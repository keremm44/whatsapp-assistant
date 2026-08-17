import * as React from "react";
import { Store } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * Product identity lockup — iris monogram tile + wordmark.
 *
 * The ONE place the light surfaces (auth) spend the brand hue, matching
 * the seller spine's brand plate. Iris is identity, never a state or an
 * interaction, so the mark reads as the product's face while interaction
 * cyan and coral attention keep their own meanings.
 */
export function BrandMark({
  subtitle,
  className,
}: {
  /** Optional quiet tagline under the wordmark. */
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-brand/40 bg-brand/15 text-brand"
      >
        <Store size={18} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-[15px] font-semibold leading-tight tracking-[-0.012em] text-foreground">
          WhatsApp Asistan
        </span>
        {subtitle ? (
          <span className="mt-0.5 block type-meta text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
    </div>
  );
}
