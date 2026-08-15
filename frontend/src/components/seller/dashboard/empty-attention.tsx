import * as React from "react";
import { Check } from "lucide-react";

/**
 * Dashboard empty state (high=0, normal=0).
 *
 * Visual identity (this pass):
 *
 *   - A single working surface (white, 1px warm border,
 *     soft shadow) with a centred, calm composition.
 *   - A petrol-soft disc with a petrol `Check` glyph — the
 *     same disc shape the page header's count badge sits
 *     in. The disc reads as "the queue is empty" rather
 *     than as a notification dot.
 *   - The eyebrow says "İş listesi" so the user knows
 *     which surface is empty.
 *   - The body line is the same Turkish copy we have
 *     always shown. We do not invent reassurance or
 *     metrics.
 */
export function EmptyAttention() {
  return (
    <section
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-4 rounded-md bg-surface px-6 py-16 text-center sm:py-20"
    >
      <span
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-muted text-primary"
      >
        <Check size={22} strokeWidth={1.6} />
      </span>
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-text">
          İş listesi
        </p>
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