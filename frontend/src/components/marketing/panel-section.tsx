import * as React from "react";
import { ArrowUpRight, MessagesSquare, Undo2 } from "lucide-react";

import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";
import { SystemNote } from "@/components/marketing/system-note";
import { StatusChip } from "@/components/shared/status-chip";

export function PanelSection() {
  return (
    <section id="panel" className="scroll-mt-20 bg-canvas">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-20 md:px-6 md:py-28 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Panel"
          title="Durduğu konuşma kaybolmaz. Önünüze gelir."
          description="Müşteri mesajını ve sizden ne beklendiğini, satıcı panelindeki gerçek çalışma düzenine yakın bir görünümde takip edersiniz."
        />

        <MarketingReveal className="mt-10 max-w-2xl">
          <SystemNote tone="paused" label="Konuşmadan gelen durum">
            Otomatik yanıt durdu. Konuşma iade incelemesine geçti.
          </SystemNote>
        </MarketingReveal>

        <MarketingReveal className="mt-6">
          <SellerDashboardProof />
        </MarketingReveal>
      </div>
    </section>
  );
}

function SellerDashboardProof() {
  return (
    <div className="overflow-hidden rounded-sheet border border-boundary bg-canvas shadow-surface">
      <div className="flex flex-col gap-5 border-b border-divider px-5 py-6 sm:flex-row sm:items-end sm:justify-between sm:gap-10 sm:px-7 sm:py-7">
        <div className="space-y-2.5">
          <p className="type-meta font-semibold text-muted-foreground">Satıcı paneli · örnek görünüm</p>
          <h3 className="font-display text-[34px] font-semibold leading-[40px] tracking-[-0.024em] text-foreground sm:text-[40px] sm:leading-[46px]">
            Bugün ilgilenmeniz gerekenler
          </h3>
          <p className="max-w-2xl type-body text-muted">
            Satıcı müdahalesi isteyen konular öncelik sırasıyla görünür.
          </p>
        </div>
        <WorkloadStats />
      </div>

      <div className="bg-raised">
        <LedgerSection title="Önce bunlar">
          <LedgerRow
            icon={Undo2}
            typeLabel="İade incelemesi"
            attention
            title="İade incelemesi"
            summary={MARKETING_STORY.returnQuestion}
            context={MARKETING_STORY.storeLabel}
            action="İade listesine git"
          />
        </LedgerSection>

        <LedgerSection title="Vakit varsa" borderTop>
          <LedgerRow
            icon={MessagesSquare}
            typeLabel="Yanıt bekleyen soru"
            title={MARKETING_STORY.unknownQuestion}
            summary="Kayıtlı net cevap bulunmuyor."
            context={MARKETING_STORY.storeLabel}
            action="Sorulara git"
          />
        </LedgerSection>
      </div>
    </div>
  );
}

function WorkloadStats() {
  const stats = [
    { label: "Önce bakılacaklar", value: 1 },
    { label: "Vakit varsa", value: 1 },
    { label: "Toplam", value: 2 },
  ] as const;

  return (
    <dl
      aria-label="Örnek görünümde ilgilenmeniz gereken 2 konu"
      className="grid w-full shrink-0 grid-cols-3 divide-x divide-divider self-start overflow-hidden rounded-sheet border border-boundary bg-raised shadow-surface sm:w-auto sm:min-w-[360px]"
    >
      {stats.map((stat) => (
        <div key={stat.label} className="px-4 py-3 sm:px-5">
          <dd className="type-figure font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground">
            {stat.value}
          </dd>
          <dt className="mt-1.5 type-meta text-muted-foreground">{stat.label}</dt>
        </div>
      ))}
    </dl>
  );
}

function LedgerSection({
  title,
  children,
  borderTop = false,
}: {
  title: string;
  children: React.ReactNode;
  borderTop?: boolean;
}) {
  return (
    <section className={borderTop ? "border-t border-divider" : undefined}>
      <div className="border-b border-divider bg-sunken px-5 py-3.5 sm:px-7">
        <p className="type-eyebrow text-muted-foreground">{title}</p>
      </div>
      {children}
    </section>
  );
}

function LedgerRow({
  icon: Icon,
  typeLabel,
  attention = false,
  title,
  summary,
  context,
  action,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  typeLabel: string;
  attention?: boolean;
  title: string;
  summary: string;
  context: string;
  action: string;
}) {
  return (
    <article className="group relative transition-colors hover:bg-elevated">
      <div className="flex flex-col gap-3 p-4 pl-5 sm:flex-row sm:items-start sm:gap-5 sm:p-5 sm:pl-6">
        <div className="flex min-w-0 items-start gap-4 sm:flex-1 sm:gap-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-boundary bg-recessed text-muted-foreground transition-colors group-hover:bg-hover group-hover:text-foreground">
            <Icon aria-hidden size={20} strokeWidth={1.6} />
          </span>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="type-meta text-muted-foreground">{typeLabel}</span>
              {attention ? (
                <StatusChip tone="attention">İncelemeniz gerekiyor</StatusChip>
              ) : null}
            </div>
            <h4 className="type-record-identity text-foreground">{title}</h4>
            <p className="type-body text-muted">{summary}</p>
            <p className="type-row-secondary text-muted-foreground">{context}</p>
          </div>
        </div>

        <a
          href="#dene"
          className="inline-flex h-11 shrink-0 items-center gap-1.5 self-start rounded-control px-2 type-row-secondary font-semibold text-primary transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:h-9"
        >
          <span>{action}</span>
          <ArrowUpRight aria-hidden size={14} strokeWidth={1.9} />
        </a>
      </div>
    </article>
  );
}
