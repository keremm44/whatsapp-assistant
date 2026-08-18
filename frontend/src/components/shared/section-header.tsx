import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * In-page section header. A short neutral rule under the title adds
 * rhythm between long work regions without spending a semantic state
 * colour or turning the heading into another card.
 */
export function SectionHeader({
  title,
  description,
  className,
  ...rest
}: {
  title: string;
  description?: string;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("space-y-1.5", className)} {...rest}>
      <h2 className="font-heading text-[18px] font-semibold leading-6 text-foreground sm:text-[20px] sm:leading-7">
        {title}
      </h2>
      <span aria-hidden="true" className="block h-px w-10 bg-boundary/75" />
      {description ? (
        <p className="type-row-secondary text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
