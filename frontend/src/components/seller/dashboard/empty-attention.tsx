import * as React from "react";
import { Check } from "lucide-react";

/**
 * The dashboard's empty state.
 *
 * Designed to feel like a quiet, well-deserved pause in the
 * seller's day — not like a placeholder waiting for content.
 *
 * Composition:
 *   - A large, soft petrol disc in the center anchors the
 *     surface. The disc is the same hue family as the rest of
 *     the chrome (petrol muted); it is not a notification dot.
 *   - A short Turkish sentence reads as a real human
 *     observation, not as a UI string template.
 *   - The eyebrow label says "İş listesi" rather than a date
 *     scope like "Bugün" — the backend's `toplam` does not
 *     represent a "today" aggregate, so the label is kept
 *     scope-neutral here too.
 *   - No fake reassurance ("you caught up on everything!"), no
 *     inferred metrics, no notifications CTA. The page simply
 *     acknowledges that the action queue is empty.
 */
export function EmptyAttention() {
  return (
    <section
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-4 rounded-md border border-border bg-surface px-6 py-14 text-center shadow-surface sm:py-16"
    >
      <span
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-muted text-primary"
      >
        <Check size={22} strokeWidth={1.6} />
      </span>
      <div className="space-y-1.5">
        <p className="text-[13px] font-medium text-primary">İş listesi</p>
        <h2 className="font-heading text-[18px] font-medium leading-snug text-foreground sm:text-[20px]">
          Şu anda ilgilenmeniz gereken bir konu yok.
        </h2>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
          Yeni konular geldiğinde burada görünecek.
        </p>
      </div>
    </section>
  );
}
