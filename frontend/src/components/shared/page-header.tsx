import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Standard page header rhythm — "The Working Ledger" pilot.
 *
 * Three layers, in order of weight:
 *   1. An optional quiet caption in sentence case (metadata role).
 *      It names the region; it is no longer an uppercase colored
 *      eyebrow.
 *   2. The page H1 in the display role (`type-page-title`):
 *      40/46 desktop, 34/40 mobile, tracked in.
 *   3. A short description in the readable secondary ink role.
 *
 * The previous decorative colored hairline under the title is gone:
 * it carried no state, and in this direction color must describe
 * state, not ornament. Typographic weight anchors the header instead.
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
          <p className="type-meta text-muted-foreground">{caption}</p>
        ) : null}
        <h1 className="type-page-title text-foreground">{title}</h1>
        {description ? (
          <p className="max-w-2xl type-body text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
