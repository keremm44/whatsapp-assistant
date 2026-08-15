import * as React from "react";
import { Check } from "lucide-react";

/**
 * Dashboard empty state (high = 0, normal = 0).
 *
 * An OPEN CALM REGION, not a bordered promotional card: no surface
 * fill, no border, no radius, no shadow. The ledger simply has
 * nothing written on today's page.
 *
 * One deliberate spot of colour: an empty queue is a TRUTHFUL
 * completion state ("you are done"), not an absence of data, so it
 * earns the success role — a small check marker, nothing more. This
 * is the calm end of the day, so it must not read as a void. The
 * Turkish copy is unchanged; no reassurance, metric or capability is
 * invented.
 */
export function EmptyAttention() {
  return (
    <section
      role="status"
      aria-live="polite"
      className="border-t border-divider py-14 sm:py-16"
    >
      <div className="max-w-md space-y-2">
        <span className="flex items-center gap-2 text-success">
          <Check aria-hidden="true" size={15} strokeWidth={2.25} />
          <span className="type-meta font-semibold">Bugünlük temiz</span>
        </span>
        <h2 className="type-record-identity text-foreground">
          Şu anda ilgilenmeniz gereken bir konu yok.
        </h2>
        <p className="type-body text-muted">
          Yeni konular geldiğinde burada görünecek.
        </p>
      </div>
    </section>
  );
}
