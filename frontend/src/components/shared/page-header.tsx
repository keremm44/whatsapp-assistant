import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Standard page header rhythm used by every seller page in this macro pass.
 *
 * The header has four deliberate layers:
 *   1. A quiet petrol caption / eyebrow (e.g. "İşler"). Sentence case.
 *   2. The page H1 (30-32px, font-medium, tight line-height).
 *   3. A short description (muted foreground, 14-16px).
 *   4. A short petrol hairline that anchors the title to the page.
 *
 * There is intentionally no full-width page-header bottom border. The
 * hairline replaces its visual role without forcing a card-like end to
 * the header.
 */
export function PageHeader({
  caption,
  title,
  description,
  actions,
  className,
}: {
  caption?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="space-y-2">
        {caption ? (
          <p className="text-[13px] font-medium leading-none text-primary-text">
            {caption}
          </p>
        ) : null}
        <h1 className="font-heading text-[30px] font-medium leading-[1.15] text-foreground sm:text-[32px]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
        <span
          aria-hidden="true"
          className="mt-2 block h-px w-7 bg-primary"
        />
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
