import * as React from "react";
import { ListChecks } from "lucide-react";

/**
 * Dashboard page header.
 *
 * Visual identity (this pass):
 *
 *   - Asymmetric. The left side carries the page identity
 *     (caption + H1 + description) on the same typography
 *     family as the sidebar brand mark. The right side
 *     carries the factual count badge.
 *
 *   - Page identity. The caption "Genel Bakış" is petrol,
 *     uppercase, tracking-wide — the same family as the
 *     sidebar's section labels so the page header and
 *     the shell feel like parts of the same product. The
 *     warm secondary character (terracotta) enters the
 *     header through the brand motif below the H1, not
 *     through the caption — this keeps the page identity
 *     control-coloured and lets the motif carry the
 *     warm signature.
 *
 *   - The H1 is in Manrope and is followed by a brand
 *     motif: a long petrol stroke + a shorter but visibly
 *     chunky terracotta stroke. The two segments sit on
 *     the same baseline with a controlled gap. The motif
 *     is the same idea the sidebar uses in its wordmark
 *     hairline, scaled up so it registers as a
 *     recognisable brand signature on the page. The
 *     terracotta segment is wide enough to actually be
 *     seen; the motif is decorative, not a status
 *     indicator.
 *
 *   - Count badge. A petrol-soft panel with a petrol
 *     `ListChecks` glyph. The text reads "İlgilenmeniz
 *     gereken N konu" — a factual description of the
 *     backend's `toplam` aggregate, NOT a "today" label.
 *
 *   - When the queue is empty (toplam = 0) the badge is
 *     omitted. The page identity still stands on its own.
 *
 *   - Mobile (< sm). The badge drops below the title block
 *     so the two never compete for horizontal space. The
 *     brand motif is preserved.
 */
export function DashboardHeader({
  total,
  caption = "Genel Bakış",
  title = "Bugün ilgilenmeniz gerekenler",
  description = "Satıcı müdahalesi isteyen konular burada öncelik sırasıyla görünecek.",
}: {
  /** The backend-provided `toplam` aggregate. */
  total: number;
  caption?: string;
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-6 pb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-text">
          {caption}
        </p>
        <h1 className="font-heading text-3xl font-semibold leading-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
        {/*
         * Brand motif: one restrained petrol rule. It anchors the title without
         * introducing decorative status colour.
         */}
        <span
          aria-hidden="true"
          className="mt-1 flex items-center gap-1.5"
        >
          <span className="block h-[2px] w-14 rounded-full bg-primary" />
        </span>
      </div>
      {total > 0 ? <CountBadge total={total} /> : null}
    </div>
  );
}

/**
 * Factual count badge.
 *
 * The badge is a petrol-soft rectangle with a petrol glyph
 * and the sentence "İlgilenmeniz gereken N konu". The
 * sentence is wrapped in a real `<p>` so screen readers
 * read it as a single phrase, and the numeral is in
 * `tabular-nums` so it does not jitter on re-render.
 */
function CountBadge({ total }: { total: number }) {
  return (
    <div
      role="status"
      aria-label={`İlgilenmeniz gereken ${total} konu`}
      className="flex w-fit items-center gap-3 self-start rounded-md bg-primary-muted/70 px-4 py-2.5 sm:self-auto"
    >
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary text-primary-foreground"
      >
        <ListChecks size={16} strokeWidth={1.7} />
      </span>
      <p className="flex items-baseline gap-1.5 text-[13px] leading-none text-foreground">
        <span className="text-foreground/80">İlgilenmeniz gereken</span>
        <span className="tabular-nums font-semibold text-primary-text">
          {total}
        </span>
        <span className="text-muted-foreground">konu</span>
      </p>
    </div>
  );
}
