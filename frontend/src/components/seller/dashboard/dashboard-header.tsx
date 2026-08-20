import * as React from "react";
import { CircleDot, ShieldCheck, Sparkles } from "lucide-react";

/**
 * Dashboard header — the top of today's work docket.
 *
 * "The Working Ledger" pilot:
 *
 *   - The H1 is the page's display role (40/46 desktop, 34/40 mobile),
 *     tracked in. It, not a badge, gives the page its weight.
 *
 *   - The workload is stated TYPOGRAPHICALLY, never as a badge. When
 *     the page knows the priority split it renders a three-figure
 *     workload strip (Önce bakılacaklar / Vakit varsa / Toplam); when
 *     only the global total is known it falls back to the single
 *     count. Every numeral is set in tabular figures, and the total
 *     keeps its explicit accessible phrase. Zero still hides the
 *     statement rather than showing an empty badge.
 */
export function DashboardHeader({
  total,
  high,
  normal,
  title = "Bugün ilgilenmeniz gerekenler",
  description = "Satıcı müdahalesi isteyen konular burada öncelik sırasıyla görünecek.",
}: {
  /** The backend-provided `toplam` aggregate. */
  total: number;
  /** Priority split, when the page has grouped the tasks. */
  high?: number;
  normal?: number;
  title?: string;
  description?: string;
}) {
  const hasSplit = typeof high === "number" && typeof normal === "number";

  return (
    <header className="dashboard-hero relative overflow-hidden rounded-floating border border-boundary/70 px-5 py-6 shadow-surface sm:px-7 sm:py-7 lg:px-8">
      <div className="dashboard-hero-orbit" aria-hidden="true" />
      <div className="relative flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-2 border-l-2 border-primary/70 py-1 pl-2.5 type-meta font-semibold text-primary">
              <CircleDot aria-hidden="true" size={13} strokeWidth={2.2} />
              Kontrol merkezi
            </span>
            <span className="inline-flex items-center gap-1.5 type-meta text-muted-foreground">
              <Sparkles aria-hidden="true" size={13} strokeWidth={1.8} className="text-brand" />
              Günlük çalışma görünümü
            </span>
          </div>
          <div className="space-y-2.5">
            <h1 className="type-page-title max-w-xl text-foreground">{title}</h1>
            {description ? (
              <p className="max-w-xl type-body text-muted">{description}</p>
            ) : null}
          </div>
          <p className="flex max-w-xl items-start gap-2.5 type-row-secondary text-muted-foreground">
            <ShieldCheck aria-hidden="true" size={17} strokeWidth={1.8} className="mt-0.5 shrink-0 text-success" />
            <span>İnceleme gerektiren kayıtlar ayrı tutulur; karar gerektiren noktalar sizin görünürlüğünüzde kalır.</span>
          </p>
        </div>
        {total > 0 ? (
          hasSplit ? (
            <WorkloadStats total={total} high={high!} normal={normal!} />
          ) : (
            <WorkloadCount total={total} />
          )
        ) : (
          <div className="dashboard-hero-calm flex items-center gap-3 self-start rounded-sheet border border-success/25 px-4 py-3 xl:self-auto">
            <ShieldCheck aria-hidden="true" size={18} strokeWidth={1.9} className="shrink-0 text-success" />
            <p className="type-row-secondary text-muted">Şu an inceleme bekleyen bir kayıt yok.</p>
          </div>
        )}
      </div>
    </header>
  );
}

/**
 * The three-figure workload strip. A bordered work sheet whose columns
 * are divided by rules — big tabular numerals, quiet labels, no badge
 * fill and no per-priority colour. It states the SAME truthful split
 * the sections below use.
 */
function WorkloadStats({
  total,
  high,
  normal,
}: {
  total: number;
  high: number;
  normal: number;
}) {
  const stats = [
    { label: "Önce bakılacaklar", value: high },
    { label: "Vakit varsa", value: normal },
    { label: "Toplam", value: total },
  ] as const;

  return (
    <dl
      role="status"
      aria-label={`İlgilenmeniz gereken ${total} konu`}
      className="dashboard-workload grid w-full shrink-0 grid-cols-3 divide-x divide-divider self-start overflow-hidden rounded-sheet border border-boundary/70 sm:w-auto sm:min-w-[372px]"
    >
      {stats.map((stat) => (
        <div key={stat.label} className="px-4 py-3 sm:px-5">
          <dd className="type-figure font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground">
            {stat.value}
          </dd>
          <dt className="mt-1.5 type-meta text-muted-foreground">
            {stat.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}

/**
 * Typographic workload statement. No badge, no fill, no icon — the
 * numeral itself carries the weight, in tabular figures so it does not
 * jitter across re-renders.
 */
function WorkloadCount({ total }: { total: number }) {
  return (
    <p
      role="status"
      aria-label={`İlgilenmeniz gereken ${total} konu`}
      className="flex shrink-0 items-baseline gap-2 self-start border-t border-divider pt-2 sm:self-auto sm:border-t-0 sm:pt-0"
    >
      <span
        aria-hidden="true"
        className="type-figure font-display text-[32px] font-semibold leading-none tracking-[-0.02em] text-foreground"
      >
        {total}
      </span>
      <span aria-hidden="true" className="type-row-secondary text-muted">
        konu ilgilenmenizi bekliyor
      </span>
    </p>
  );
}
