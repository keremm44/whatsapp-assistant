import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Marketing section heading.
 *
 * Carries the seller workspace's page-title signature into the public
 * site — a neutral structural eyebrow, a display title, the three-part
 * rule (interaction cyan + identity iris + quiet divider) and an
 * optional lead paragraph. The rule is a brand cue, not a state
 * indicator; it never uses the attention hue.
 */
export function MarketingSectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow ? (
        <p className="type-eyebrow text-muted-foreground">{eyebrow}</p>
      ) : null}
      <h2 className="max-w-3xl font-display text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-foreground sm:text-[34px] sm:leading-[40px]">
        {title}
      </h2>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-1 items-center gap-1.5",
          align === "center" && "justify-center",
        )}
      >
        <span className="h-0.5 w-8 rounded-pill bg-primary/80" />
        <span className="h-0.5 w-3 rounded-pill bg-brand/75" />
        <span className="h-px w-10 bg-divider" />
      </span>
      {description ? (
        <p className="max-w-2xl type-body text-muted">{description}</p>
      ) : null}
    </div>
  );
}
