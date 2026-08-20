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
      <div className="mx-auto w-full max-w-[720px] px-5">
        <h2 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.022em] text-foreground">
          Durduğu konuşma kaybolmaz. Yapılacak işe dönüşür.
        </h2>
      </div>

      <MarketingReveal variant="product" className="mt-8">
        <div className="mx-auto w-full max-w-[720px] px-5">
          <SellerDashboardProof />
        </div>
      </MarketingReveal>
    </section>
  );
}

function SellerDashboardProof() {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 className="type-section text-foreground">Bugün ilgilenmeniz gerekenler</h3>
        <WorkloadStats />
      </div>

      <section aria-labelledby="marketing-panel-primary" className="mt-6 border-t border-divider pt-5">
        <h4 id="marketing-panel-primary" className="type-row-primary text-foreground">
          Önce bunlar
        </h4>
        <PriorityProofRow
          taskType="return_review"
          title={EXAMPLE_RETURN_TASK_TITLE}
          summary={MARKETING_STORY.returnQuestion}
          context={`${MARKETING_STORY.ledger.returnReview.time} · WhatsApp müşterisi`}
        />
      </section>

      <section aria-labelledby="marketing-panel-secondary" className="border-t border-divider pt-5">
        <h4 id="marketing-panel-secondary" className="type-row-primary text-foreground">
          Bugün bakılabilecekler
        </h4>
        <SecondaryProofRow
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
      className="flex flex-wrap gap-x-5 gap-y-1 type-meta text-muted-foreground"
    >
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-baseline gap-1.5">
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

  return (
    <article className="py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {meta.sellerReview && meta.attentionLabel ? (
          <StatusChip tone="attention">{meta.attentionLabel}</StatusChip>
        ) : null}
        <span className="type-meta text-muted-foreground">{context}</span>
      </div>
      <h5 className="mt-2 type-row-primary text-foreground">{title}</h5>
      <p className="mt-1 type-row-secondary text-muted">{summary}</p>
      <p className="mt-2 type-row-secondary font-semibold text-primary">{meta.cta}</p>
    </article>
  );
}

function SecondaryProofRow({
  title,
  context,
}: {
  title: string;
  context: string;
}) {
  return (
    <div className="py-4">
      <p className="type-row-primary text-foreground">{title}</p>
      <p className="mt-1 type-meta text-muted-foreground">{context}</p>
    </div>
  );
}
