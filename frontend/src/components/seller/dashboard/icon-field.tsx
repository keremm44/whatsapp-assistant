import * as React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Quiet icon field used as the visual anchor of a high-priority
 * task card.
 *
 * The field is a soft, warm square that belongs to the surface
 * family (not a colored badge). The icon inside is set in a
 * slightly stronger tone of the same hue. The whole field is
 * deliberately NOT a chip and NOT a pill — it reads as a
 * working tool, not a notification bubble.
 *
 * Three tones cover the three backend task types:
 *   - "primary"  -> petrol-soft surface, petrol icon
 *   - "review"   -> clay-soft surface,  deep-clay icon
 *   - "neutral"  -> linen surface,        muted icon
 *
 * The clay tone is used here ONLY for `return_review`, which is
 * the only task type the backend attaches to the clay
 * semantic family in the canonical Sakin Ustalık palette. Clay
 * is never used as a "danger" or "urgency" cue.
 */

export type IconFieldTone = "primary" | "review" | "neutral";

const TONE_SURFACE: Record<IconFieldTone, string> = {
  primary: "bg-primary-muted text-primary",
  review: "bg-accent-muted text-accent-dark",
  neutral: "bg-surface-2 text-muted-foreground",
};

export function IconField({
  icon: Icon,
  tone = "primary",
  size = 44,
  className,
}: {
  icon: LucideIcon;
  tone?: IconFieldTone;
  /** Outer square size. Defaults to 44px to keep the touch target
   *  generous on mobile and the visual weight on desktop. */
  size?: 40 | 44 | 48;
  className?: string;
}) {
  const iconPx = size >= 48 ? 22 : 20;
  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-md ${TONE_SURFACE[tone]} ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <Icon size={iconPx} strokeWidth={1.6} />
    </div>
  );
}
