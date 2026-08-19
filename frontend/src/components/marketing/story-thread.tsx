import * as React from "react";

import { cn } from "@/lib/utils/cn";

type StoryThreadTone = "neutral" | "attention";

type OwnershipLedgerTone = "assistant" | "handoff" | "attention";

/**
 * Structural breadcrumb for distant proof moments. It remains intentionally
 * small; the main landing grammar is the ownership ledger row below.
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
      className={cn("flex min-w-0 items-start gap-3", className)}
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
