import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Section heading used by the dashboard's work sections.
 *
 * Visual character:
 *
 *   - The H2 sits to the right of a short vertical
 *     terracotta rail. The rail is 2px wide, ~22-24px
 *     tall, and lives on the same baseline as the H2.
 *     It is decorative brand architecture — NOT a
 *     status, priority, return, or unread indicator.
 *
 *   - The rail and the H2 are followed by a quiet
 *     description and a brand motif (long petrol +
 *     shorter terracotta) under the H2. The motif is the
 *     same one the page header uses, scaled smaller for
 *     section-level framing.
 *
 *   - The component is intentionally section-agnostic. It
 *     is used by the high-priority column, the
 *     normal-priority column, and the right-hand
 *     secondary panel so every work section in the
 *     workspace shares the same brand header language.
 */
export function SectionHeading({
  id,
  title,
  count,
  description,
  railTone = "accent",
  motif = true,
  className,
}: {
  id: string;
  title: string;
  count?: number;
  description?: string;
  /**
   * The decorative vertical rail's colour family. Defaults
   * to `accent` (terracotta) so the dashboard's work
   * sections all carry the warm signature. We never use
   * this rail to imply status, priority, return state, or
   * unread state.
   */
  railTone?: "accent" | "primary";
  /** When true, the petrol + terracotta brand motif renders below the description. */
  motif?: boolean;
  className?: string;
}) {
  const railClass =
    railTone === "primary" ? "bg-primary" : "bg-accent";
  return (
    <header className={cn("space-y-2", className)}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn("block w-[2px] rounded-full", railClass)}
          style={{ height: 22 }}
        />
        <div className="flex min-w-0 items-baseline gap-2">
          <h2
            id={id}
            className="font-heading text-[20px] font-medium leading-snug text-foreground sm:text-[22px]"
          >
            {title}
          </h2>
          {typeof count === "number" ? (
            <span
              aria-hidden="true"
              className="text-[13px] tabular-nums text-muted-foreground"
            >
              · {count}
            </span>
          ) : null}
        </div>
      </div>
      {description ? (
        <p className="pl-[14px] text-sm text-muted-foreground">{description}</p>
      ) : null}
      {motif ? (
        <span
          aria-hidden="true"
          className="ml-[14px] flex items-center gap-1"
        >
          <span className="block h-[1.5px] w-8 rounded-full bg-primary/70" />
          <span className="block h-[1.5px] w-3 rounded-full bg-accent" />
        </span>
      ) : null}
    </header>
  );
}
