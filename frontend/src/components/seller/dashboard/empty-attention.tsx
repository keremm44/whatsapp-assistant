import * as React from "react";

/**
 * Dashboard empty state (high = 0, normal = 0).
 *
 * "The Working Ledger" pilot: an OPEN CALM REGION, not a bordered
 * promotional card. There is no surface fill, no border, no radius,
 * no shadow and no coloured disc — the ledger simply has nothing
 * written on today's page, and the canvas is allowed to show that.
 *
 * A single divider rule at the top ties the region to the header, and
 * the message is carried by type. The Turkish copy is unchanged; no
 * reassurance, metric or capability is invented.
 */
export function EmptyAttention() {
  return (
    <section
      role="status"
      aria-live="polite"
      className="border-t border-divider py-14 sm:py-16"
    >
      <div className="max-w-md space-y-2">
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
