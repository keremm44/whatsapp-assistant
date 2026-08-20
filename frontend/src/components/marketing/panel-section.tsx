import * as React from "react";
import { ArrowUpRight, ChevronRight } from "lucide-react";

import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { DASHBOARD_TASK_PRESENTATION } from "@/components/seller/dashboard/task-presentation";
import { StatusChip } from "@/components/shared/status-chip";
import type { DashboardTaskType } from "@/lib/seller/dashboard-tasks";

const EXAMPLE_RETURN_TASK_TITLE = "İade / sorun talebi inceleme bekliyor";
const EXAMPLE_UNANSWERED_TASK_TITLE = "Cevaplanamayan müşteri sorusu";

export function PanelSection() {
  const record = MARKETING_STORY.ledger.returnReview;

  return (
    <section id="panel" className="scroll-mt-20 bg-canvas py-16 md:py-24">
      <div className="mx-auto w-full max-w-[1180px] px-4 md:px-6 lg:px-8">
        <div className="max-w-[900px]">
          <p className="type-eyebrow text-muted-foreground">Bugün bakmanız gerekenler</p>
          <h2 className="mt-3 font-display text-[36px] font-semibold leading-[42px] tracking-[-0.027em] text-foreground sm:text-[50px] sm:leading-[56px]">
            Durduğu konuşma kaybolmaz. Yapılacak işe dönüşür.
          </h2>
          <p className="mt-4 max-w-2xl type-body text-muted">
            Az önce gördüğünüz aynı iade konuşması, sizden ne beklendiği belli bir
            kayıt olarak sıraya girer. Önce karar gerekenler; vakit varsa diğerleri.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-l-2 border-attention pl-4">
          <span className="type-meta type-figure font-semibold text-muted-foreground">
            {record.time}
          </span>
          <span className="type-row-secondary text-foreground">{record.message}</span>
          <StatusChip tone="attention">İncelemeniz gerekiyor</StatusChip>
        </div>
      </div>

      <MarketingReveal variant="product" className="mt-10">
        <div className="mx-auto w-full max-w-[1560px] px-4 md:px-6 lg:min-h-[720px] lg:px-8">
          <SellerDashboardProof />
        </div>
      </MarketingReveal>
    </section>
  );
}

function SellerDashboardProof() {
  return (
    <div className="flex h-full min-h-[inherit] flex-col overflow-hidden rounded-sheet border border-boundary/60 bg-raised shadow-surface">
      <div className="flex flex-col gap-5 border-b border-divider px-5 py-6 sm:flex-row sm:items-end sm:justify-between sm:gap-10 sm:px-8 sm:py-7">
        <div className="space-y-2">
          <p className="type-meta font-semibold text-muted-foreground">
            Genel bakış · örnek gün
          </p>
          <h3 className="type-page-title text-foreground">Bugün ilgilenmeniz gerekenler</h3>
          <p className="max-w-2xl type-body text-muted">
            Satıcı müdahalesi isteyen konular burada öncelik sırasıyla görünür.
          </p>
        </div>
        <WorkloadStats />
      </div>

      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
        <section
          aria-labelledby="marketing-panel-primary"
          className="flex flex-col border-b border-divider lg:border-b-0 lg:border-r"
        >
          <div className="px-5 pb-2 pt-6 sm:px-8">
            <ProofSectionHeading
              id="marketing-panel-primary"
              title="Önce bunlar"
              count={1}
              description="İncelemeniz gereken konular."
            />
          </div>
          <PriorityProofRow
            taskType="return_review"
            title={EXAMPLE_RETURN_TASK_TITLE}
            summary={MARKETING_STORY.returnQuestion}
            context={`${MARKETING_STORY.ledger.returnReview.time} · WhatsApp müşterisi`}
          />
        </section>

        <aside className="flex flex-col">
          <section aria-labelledby="marketing-panel-secondary" className="flex-1">
            <header className="flex items-baseline gap-2.5 px-5 pb-1 pt-6 sm:px-6">
              <h4
                id="marketing-panel-secondary"
                className="font-heading text-[17px] font-semibold leading-6 text-foreground"
              >
                Bugün bakılabilecekler
              </h4>
              <span aria-hidden="true" className="type-meta type-figure text-muted-foreground">
                1
              </span>
            </header>
            <SecondaryProofRow
              taskType="unanswered_question"
              title={EXAMPLE_UNANSWERED_TASK_TITLE}
              context={`${MARKETING_STORY.ledger.unknown.time} · WhatsApp müşterisi`}
            />
          </section>
          <QuietSummaryProof />
        </aside>
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
      role="status"
      aria-label="İlgilenmeniz gereken 2 konu"
      className="grid w-full shrink-0 grid-cols-3 self-start sm:w-auto sm:min-w-[320px]"
    >
      {stats.map((stat) => (
        <div key={stat.label} className="px-3 py-1 first:pl-0 sm:px-4">
          <dd className="type-figure font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground">
            {stat.value}
          </dd>
          <dt className="mt-1.5 type-meta text-muted-foreground">{stat.label}</dt>
        </div>
      ))}
    </dl>
  );
}

function ProofSectionHeading({
  id,
  title,
  count,
  description,
}: {
  id: string;
  title: string;
  count: number;
  description: string;
}) {
  return (
    <header className="space-y-1">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h4 id={id} className="type-section text-foreground">
          {title}
        </h4>
        <span aria-hidden="true" className="type-row-secondary type-figure text-muted-foreground">
          {count}
        </span>
      </div>
      <p className="type-row-secondary text-muted-foreground">{description}</p>
    </header>
  );
}

function PriorityProofRow({
  taskType,
  title,
  summary,
  context,
}: {
  taskType: DashboardTaskType;
  title: string;
  summary: string;
  context: string;
}) {
  const meta = DASHBOARD_TASK_PRESENTATION[taskType];
  const Icon = meta.icon;

  return (
    <article className="group relative mt-2">
      <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-start sm:gap-5 sm:px-8 sm:py-6">
        <div className="flex min-w-0 items-start gap-4 sm:flex-1 sm:gap-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-boundary/40 bg-recessed text-muted-foreground">
            <Icon aria-hidden="true" size={20} strokeWidth={1.6} />
          </span>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="type-meta text-muted-foreground">{meta.label}</span>
              {meta.sellerReview && meta.attentionLabel ? (
                <StatusChip tone="attention">{meta.attentionLabel}</StatusChip>
              ) : null}
            </div>
            <h5 className="type-record-identity text-foreground">{title}</h5>
            <p className="type-body text-muted">{summary}</p>
            <p className="type-row-secondary text-muted-foreground">{context}</p>
          </div>
        </div>

        <div className="shrink-0 self-start sm:text-right">
          <p className="type-meta text-muted-foreground">Panel aksiyonu</p>
          <span className="mt-1 inline-flex h-11 items-center gap-1.5 rounded-control px-2 type-row-secondary font-semibold text-primary sm:h-9">
            <span>{meta.cta}</span>
            <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.9} />
          </span>
        </div>
      </div>
    </article>
  );
}

function SecondaryProofRow({
  taskType,
  title,
  context,
}: {
  taskType: DashboardTaskType;
  title: string;
  context: string;
}) {
  const meta = DASHBOARD_TASK_PRESENTATION[taskType];
  const Icon = meta.icon;

  return (
    <div className="flex min-h-[60px] items-start gap-3 px-5 py-4 sm:px-6">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-boundary/40 bg-recessed text-muted-foreground">
        <Icon aria-hidden="true" size={16} strokeWidth={1.6} />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <span className="type-meta text-muted-foreground">{meta.label}</span>
        <p className="line-clamp-2 type-row-primary text-foreground">{title}</p>
        <p className="truncate type-meta text-muted-foreground">{context}</p>
      </div>
      <ChevronRight
        aria-hidden="true"
        size={16}
        strokeWidth={1.5}
        className="mt-2 shrink-0 text-muted-foreground"
      />
    </div>
  );
}

function QuietSummaryProof() {
  const rows = [
    { label: "Önce bakılacaklar", value: 1, emphasize: false },
    { label: "Vakit varsa", value: 1, emphasize: false },
    { label: "Toplam", value: 2, emphasize: true },
  ] as const;

  return (
    <section
      aria-labelledby="marketing-panel-summary"
      className="mt-auto border-t border-divider px-5 py-4 sm:px-6"
    >
      <h4 id="marketing-panel-summary" className="type-meta font-semibold text-muted-foreground">
        Özet
      </h4>
      <dl className="mt-3 space-y-2">
        {rows.map((row, index) => (
          <React.Fragment key={row.label}>
            {row.emphasize && index > 0 ? (
              <div className="my-1.5 h-px bg-divider" aria-hidden="true" />
            ) : null}
            <div className="flex items-center justify-between type-row-secondary">
              <dt className={row.emphasize ? "font-semibold text-foreground" : "text-muted-foreground"}>
                {row.label}
              </dt>
              <dd className={row.emphasize ? "tabular-nums font-semibold text-foreground" : "tabular-nums text-muted"}>
                {row.value}
              </dd>
            </div>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );
}
