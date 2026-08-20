import { ArrowUpRight, ChevronRight } from "lucide-react";

import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { DASHBOARD_TASK_PRESENTATION } from "@/components/seller/dashboard/task-presentation";
import { StatusChip } from "@/components/shared/status-chip";
import type { DashboardTaskType } from "@/lib/seller/dashboard-tasks";

const EXAMPLE_RETURN_TASK_TITLE = "İade / sorun talebi inceleme bekliyor";
const EXAMPLE_UNANSWERED_TASK_TITLE = "Cevaplanamayan müşteri sorusu";

export function PanelSection() {
  return (
    <section id="panel" className="scroll-mt-20 bg-canvas py-12 md:py-16">
      <div className="mx-auto w-full max-w-[1180px] px-4 md:px-6 lg:px-8">
        <p className="type-eyebrow text-muted-foreground">Bugün bakmanız gerekenler</p>
        <h2 className="mt-3 max-w-[900px] font-display text-[32px] font-semibold leading-[38px] tracking-[-0.025em] text-foreground sm:text-[42px] sm:leading-[48px]">
          Durduğu konuşma kaybolmaz. Yapılacak işe dönüşür.
        </h2>
      </div>

      <MarketingReveal variant="product" className="mt-8">
        <div className="mx-auto w-full max-w-[1560px] px-4 md:px-6 lg:min-h-[720px] lg:px-8">
          <SellerDashboardProof />
        </div>
      </MarketingReveal>
    </section>
  );
}

function SellerDashboardProof() {
  return (
    <div className="overflow-hidden rounded-sheet border border-boundary/60 bg-raised shadow-surface">
      <div className="flex flex-wrap items-end justify-between gap-6 px-5 py-5 sm:px-7">
        <h3 className="type-section text-foreground">Bugün ilgilenmeniz gerekenler</h3>
        <WorkloadStats />
      </div>

      <section aria-labelledby="marketing-panel-primary" className="border-t border-divider">
        <header className="flex items-baseline gap-2.5 px-5 pt-5 sm:px-7">
          <h4 id="marketing-panel-primary" className="type-row-primary text-foreground">
            Önce bunlar
          </h4>
        </header>
        <PriorityProofRow
          taskType="return_review"
          title={EXAMPLE_RETURN_TASK_TITLE}
          summary={MARKETING_STORY.returnQuestion}
          context={`${MARKETING_STORY.ledger.returnReview.time} · WhatsApp müşterisi`}
        />
      </section>

      <section aria-labelledby="marketing-panel-secondary" className="border-t border-divider">
        <header className="flex items-baseline gap-2.5 px-5 pt-5 sm:px-7">
          <h4 id="marketing-panel-secondary" className="type-row-primary text-foreground">
            Bugün bakılabilecekler
          </h4>
        </header>
        <SecondaryProofRow
          taskType="unanswered_question"
          title={EXAMPLE_UNANSWERED_TASK_TITLE}
          context={`${MARKETING_STORY.ledger.unknown.time} · WhatsApp müşterisi`}
        />
      </section>
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
      className="flex flex-wrap gap-x-6 gap-y-1 type-meta text-muted-foreground"
    >
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-baseline gap-2">
          <dt>{stat.label}</dt>
          <dd className="type-figure font-semibold text-foreground">{stat.value}</dd>
        </div>
      ))}
    </dl>
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
    <article className="px-5 py-4 sm:px-7">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground">
          <Icon aria-hidden="true" size={18} strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {meta.sellerReview && meta.attentionLabel ? (
              <StatusChip tone="attention">{meta.attentionLabel}</StatusChip>
            ) : null}
            <span className="type-meta text-muted-foreground">{context}</span>
          </div>
          <h5 className="mt-1 type-row-primary text-foreground">{title}</h5>
          <p className="mt-1 type-row-secondary text-muted">{summary}</p>
        </div>
        <span className="inline-flex h-11 shrink-0 items-center gap-1 type-row-secondary font-semibold text-primary sm:h-9">
          <span>{meta.cta}</span>
          <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.9} />
        </span>
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
    <div className="flex min-h-[52px] items-center gap-4 px-5 py-4 sm:px-7">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground">
        <Icon aria-hidden="true" size={16} strokeWidth={1.6} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="type-row-primary text-foreground">{title}</p>
        <p className="type-meta text-muted-foreground">{context}</p>
      </div>
      <ChevronRight
        aria-hidden="true"
        size={16}
        strokeWidth={1.5}
        className="shrink-0 text-muted-foreground"
      />
    </div>
  );
}
