import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * In-page section header. Used to label the macro regions on the seller
 * overview page ("Önce bunlar", "Bugün bakılabilecekler", "Günün özeti")
 * without turning them into equal-weight cards.
 *
 * Additional props (e.g. `id`) are forwarded onto the wrapper so the
 * surrounding <section> can reference it via aria-labelledby.
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
    <div className={cn("space-y-1", className)} {...rest}>
      <h2 className="font-heading text-[18px] font-semibold leading-6 text-foreground sm:text-[20px] sm:leading-7">
        {title}
      </h2>
      {description ? (
        <p className="type-row-secondary text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
