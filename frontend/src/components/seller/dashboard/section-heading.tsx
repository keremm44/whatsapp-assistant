import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Section heading used by the dashboard's work sections.
 *
 * Visual character:
 *
 *   - The H2 sits next to a thin coloured rail. The rail
 *     colour is the section's brand character:
 *       - default ("primary") -> petrol rail, the
 *         control colour, used for the "Önce bunlar"
 *         primary work section
 *       - "accent" -> terracotta rail, the warm
 *         secondary colour, used for the "Bugün
 *         bakılabilecekler" supporting section
 *     The rail is decorative brand architecture, NOT a
 *     status, priority, return, or unread indicator.
 *
 *   - The optional `motif` adds a single brand motif
 *     (long primary + shorter accent) below the
 *     description. The motif is the same shape the
 *     page header uses, scaled smaller. By default the
 *     motif is OFF; the supporting section turns it
 *     ON so the two sections deliberately differ in
 *     weight rather than every section repeating the
 *     same micro-line.
 */
export function SectionHeading({
  id,
  title,
  count,
  description,
  railTone = "primary",
  motif = false,
  className,
}: {
  id: string;
  title: string;
  count?: number;
  description?: string;
  /**
   * Decorative rail colour. `primary` (petrol) for the
   * primary work section; `accent` (terracotta) for the
   * supporting section. Never used to imply a state.
   */
  railTone?: "primary" | "accent";
  /**
   * Whether the brand motif renders below the description.
   * Off by default so the page header is the only place
   * the full motif appears.
   */
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
