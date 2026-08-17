import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Status chip — the ONE place a lifecycle state may spend a soft muted
 * fill. The `*-muted` materials were declared for exactly this
 * (chips/notices) but barely spent; this component is where they
 * become visible without becoming noise.
 *
 * A chip means "this record has a state worth noticing". States that
 * have nothing to say do NOT get a chip:
 *
 *   attention / accent  coral   you must act (seller review)
 *   success             green   truthful terminal completion
 *   paused              slate   deliberately inactive
 *   muted               —       in progress; rendered as plain quiet
 *                               text, never promoted to a badge, so a
 *                               badge stays a signal instead of
 *                               uniform wallpaper.
 *
 * Cyan is never a state outcome: cyan is interaction, and a status
 * chip that borrowed it would blur selection and state. The chip also
 * never expresses state by colour alone — the label text is always
 * present.
 */

/** "accent" and "attention" are the same coral semantic in different
 * call sites; both map to the same chip. */
export type StatusChipTone =
  | "attention"
  | "accent"
  | "success"
  | "paused"
  | "muted";

const TONE_CLASSES: Record<Exclude<StatusChipTone, "muted">, string> = {
  attention: "bg-accent-muted text-accent-text",
  accent: "bg-accent-muted text-accent-text",
  success: "bg-success-muted text-success",
  paused: "bg-paused-muted text-paused",
};

export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: StatusChipTone;
  children: React.ReactNode;
  className?: string;
}) {
  if (tone === "muted") {
    return (
      <span className={cn("font-medium text-muted-foreground", className)}>
        {children}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11px] font-semibold leading-4",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {/* The dot inherits the chip's ink, so tone is carried twice:
          text + a fixed-width mark that never reflows. */}
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
      />
      <span className="truncate">{children}</span>
    </span>
  );
}
