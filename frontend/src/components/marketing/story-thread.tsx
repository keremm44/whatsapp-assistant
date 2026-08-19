import * as React from "react";

import { cn } from "@/lib/utils/cn";

type OwnershipLedgerTone = "assistant" | "handoff" | "attention";

/**
 * The public site's primary composition grammar: one customer event, its
 * owner, and its outcome on the same ledger line. It deliberately avoids a
 * card shell so consecutive events read as one workday rather than feature
 * islands. Colour is not the only signal: owner/outcome copy carries state.
 */
export function OwnershipLedgerRow({
  time,
  topic,
  message,
  owner,
  outcome,
  tone = "assistant",
  className,
}: {
  time: string;
  topic: string;
  message: string;
  owner: string;
  outcome: string;
  tone?: OwnershipLedgerTone;
  className?: string;
}) {
  const attention = tone === "attention";
  const handoff = tone === "handoff";

  return (
    <article
      className={cn(
        "grid min-w-0 gap-3 border-t border-divider py-5 md:grid-cols-[72px_minmax(0,1fr)_220px] md:items-center md:gap-6 md:py-6",
        className,
      )}
    >
      <div className="flex items-baseline gap-3 md:block">
        <time className="type-meta type-figure font-semibold text-muted-foreground">
          {time}
        </time>
        <span className="type-meta text-muted-foreground md:mt-1 md:block">{topic}</span>
      </div>

      <blockquote className="min-w-0 font-heading text-[18px] font-medium leading-7 text-foreground sm:text-[20px] sm:leading-8">
        “{message}”
      </blockquote>

      <div className="min-w-0 md:text-right">
        <div className="flex items-center gap-2 md:justify-end">
          <span
            aria-hidden="true"
            className={cn(
              "h-2 w-2 shrink-0 rounded-full border",
              attention
                ? "border-attention bg-attention"
                : handoff
                  ? "border-boundary bg-muted-foreground"
                  : "border-primary bg-primary",
            )}
          />
          <p
            className={cn(
              "type-meta font-semibold uppercase tracking-[0.08em]",
              attention
                ? "text-attention"
                : handoff
                  ? "text-foreground"
                  : "text-primary",
            )}
          >
            {owner}
          </p>
        </div>
        <p className="mt-1 type-row-secondary text-muted">{outcome}</p>
      </div>
    </article>
  );
}
