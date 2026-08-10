import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AccessUnavailable } from "@/components/auth/access-unavailable";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { Surface } from "@/components/shared/surface";

import { resolveDashboardTasksFromSession } from "@/lib/seller/dashboard-tasks-server";
import type { DashboardTask, DashboardTaskType } from "@/lib/seller/dashboard-tasks";

/**
 * Genel Bakış — satıcının günlük dikkat merkezi.
 *
 * Server Component. The page resolves the seller's action queue
 * server-side from `GET /seller/dashboard/tasks` using the same
 * Supabase session the auth foundation and seller bootstrap just
 * validated. There is no client hydration, no skeleton, and no
 * secondary fetch.
 *
 * Information architecture:
 *
 *   The backend explicitly exposes a user-facing priority
 *   categorization on each task: `priority: "high" | "normal"`.
 *   The SQL read model defines the fixed mapping:
 *
 *     return_review       -> high
 *     order_review        -> high
 *     unanswered_question -> normal
 *
 *   The dashboard renders the approved two-section IA:
 *
 *     "Önce bunlar"            <- priority === "high"
 *     "Bugün bakılabilecekler"  <- priority === "normal"
 *
 *   Tasks within each section are rendered in the order returned
 *   by the backend (`priority_rank ASC, updated_at DESC,
 *   related_entity_id DESC`). The frontend never re-sorts.
 *
 *   Visual character (this step):
 *
 *   - Each section is a single working surface (Surface, white
 *     canvas) holding comparable task rows. We deliberately do
 *     NOT wrap each task in its own card. The card-per-task
 *     pattern reads as a "CRM stack" and dilutes the queue
 *     feeling.
 *   - The "high" section is signalled by a thin petrol hairline
 *     under its header and a subtle petrol caption. The "normal"
 *     section has no extra color. Priority is communicated by
 *     position and by the header's micro-architecture, not by
 *     painting the entire section.
 *   - Each row carries a small type pill (color-coded by backend
 *     `type` only — not by `priority` — so the pill is a stable
 *     category label rather than an "urgency" widget).
 *   - The CTA is a quiet secondary button with a right-arrow
 *     affordance. It is never the heaviest element on the row.
 *   - Below both sections sits a very low-emphasis summary line
 *     that uses only the backend-provided `toplam` aggregate. It
 *     is omitted entirely when `toplam === 0` to avoid noise.
 *   - The "Günün özeti" placeholder label is dropped — the line
 *     itself is self-explanatory in this layout, and the
 *     explicit label was adding visual weight without adding
 *     information.
 */
export default async function SellerOverviewPage() {
  const bootstrap = await resolveDashboardTasksFromSession();

  if (bootstrap.state !== "ready") {
    // Page-content failure. The seller shell (and therefore auth +
    // bootstrap) has already passed; the dashboard data fetch is
    // the only thing that failed. We do NOT invalidate the
    // session. We render a calm recoverable surface scoped to
    // this page using the existing AccessUnavailable language.
    return (
      <PageContainer className="py-8 sm:py-10">
        <PageHeader
          caption="Genel Bakış"
          title="Bugün ilgilenmeniz gerekenler"
          description="Satıcı müdahalesi isteyen konular burada öncelik sırasıyla görünecek."
        />
        <div className="mt-8">
          <AccessUnavailable compact contextLabel="İş listesi" />
        </div>
      </PageContainer>
    );
  }

  const { total, tasks } = bootstrap.tasks;
  const hasTasks = tasks.length > 0;

  // Group by the backend's `priority` field. The backend's order
  // within each priority bucket is preserved verbatim because
  // `Array.prototype.filter` walks the source array in order.
  const highTasks = tasks.filter((task) => task.priority === "high");
  const normalTasks = tasks.filter((task) => task.priority === "normal");

  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption="Genel Bakış"
        title="Bugün ilgilenmeniz gerekenler"
        description="Satıcı müdahalesi isteyen konular burada öncelik sırasıyla görünecek."
      />

      {hasTasks ? (
        <div className="mt-8 flex flex-col gap-8 sm:mt-10 sm:gap-10">
          {highTasks.length > 0 ? (
            <DashboardTaskSection
              id="section-once-bunlar"
              title="Önce bunlar"
              count={highTasks.length}
              description="İncelemeniz gereken konular."
              tasks={highTasks}
              emphasis="primary"
            />
          ) : null}

          {normalTasks.length > 0 ? (
            <DashboardTaskSection
              id="section-bugun-bakilabilecekler"
              title="Bugün bakılabilecekler"
              count={normalTasks.length}
              description="Vakit varsa ilerleyebileceğiniz konular."
              tasks={normalTasks}
              emphasis="neutral"
            />
          ) : null}
        </div>
      ) : (
        <DashboardEmptyState />
      )}

      {total > 0 ? (
        <p className="mt-10 text-[13px] leading-relaxed text-muted-foreground sm:mt-12">
          İlgilenmeniz gereken {total} konu var.
        </p>
      ) : null}
    </PageContainer>
  );
}

/**
 * Calm empty state for the dashboard. The empty surface is a thin
 * working surface (Surface) so the page does not feel naked, and
 * the copy stays exactly as it was — no invented data, no
 * placeholder rows.
 */
function DashboardEmptyState() {
  return (
    <Surface className="mt-8 px-5 py-6 sm:px-6 sm:py-7">
      <EmptyState
        variant="compact"
        caption="Bugün ilgilenmeniz gerekenler"
        title="Şu anda ilgilenmeniz gereken bir konu yok."
        description="Yeni konular geldiğinde burada görünecek."
      />
    </Surface>
  );
}

/**
 * A single dashboard section.
 *
 * On desktop and tablet the section is a single Surface that
 * contains a stack of comparable task rows separated by 1px
 * dividers. On mobile the same rows remain in the same Surface
 * (the Surface is already comfortable on small screens) but the
 * row internals stack and the CTA becomes full-width so it
 * remains comfortably tappable.
 *
 * The `emphasis` flag only controls the header micro-architecture
 * (caption color + hairline). It is not used to paint the entire
 * section.
 */
function DashboardTaskSection({
  id,
  title,
  count,
  description,
  tasks,
  emphasis,
}: {
  id: string;
  title: string;
  count: number;
  description: string;
  tasks: DashboardTask[];
  emphasis: "primary" | "neutral";
}) {
  // The section header is composed inline so the meta line
  // ("Öncelikli · N konu") can sit visually under the description
  // without extending the shared SectionHeader API for a single
  // caller.
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="space-y-2">
        <SectionHeader id={id} title={title} description={description} />
        <p
          className={
            emphasis === "primary"
              ? "flex items-center gap-2 text-[13px] font-medium text-primary"
              : "flex items-center gap-2 text-[13px] font-medium text-muted-foreground"
          }
        >
          <span>{emphasis === "primary" ? "Öncelikli" : "Sıradaki"}</span>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          <span className="tabular-nums">{count} konu</span>
        </p>
      </div>
      <Surface className="overflow-hidden">
        <ul role="list" className="divide-y divide-divider">
          {tasks.map((task) => (
            <DashboardTaskRow key={task.id} task={task} />
          ))}
        </ul>
      </Surface>
    </section>
  );
}

/**
 * Map a backend task type to its UI metadata: short label, target
 * route, and CTA copy. The label is the user-facing category and
 * is intentionally short so it fits inside the small type pill
 * without breaking the rhythm of the row.
 */
const TASK_TYPE_PILL_LABEL: Record<DashboardTaskType, string> = {
  return_review: "İade incelemesi",
  order_review: "Sipariş incelemesi",
  unanswered_question: "Yanıt bekleyen soru",
};

const TASK_TYPE_ROUTES: Record<DashboardTaskType, Route> = {
  return_review: "/seller/returns",
  order_review: "/seller/orders",
  unanswered_question: "/seller/unanswered",
};

const TASK_TYPE_CTA: Record<DashboardTaskType, string> = {
  return_review: "İadelere git",
  order_review: "Siparişlere git",
  unanswered_question: "Sorulara git",
};

const TASK_TYPE_PILL_TONE: Record<
  DashboardTaskType,
  "primary" | "review" | "info"
> = {
  return_review: "review",
  order_review: "primary",
  unanswered_question: "info",
};

/**
 * Small, quiet category pill. The tone is keyed to the backend
 * `type` only (so the pill reads as a category, not as an
 * urgency indicator). The pill sits at the top of each row and
 * never carries the row's main weight — the title does.
 */
function TaskTypePill({ type }: { type: DashboardTaskType }) {
  const tone = TASK_TYPE_PILL_TONE[type];
  const toneClass =
    tone === "primary"
      ? "bg-primary-muted text-primary"
      : tone === "review"
        ? "bg-review-muted text-review"
        : "bg-info-muted text-info";

  return (
    <span
      className={`inline-flex h-5 items-center rounded-pill px-2 text-[11px] font-medium leading-none tracking-wide ${toneClass}`}
    >
      {TASK_TYPE_PILL_LABEL[type]}
    </span>
  );
}

/**
 * Compose the meta line under the summary. We only ever render
 * fields that the backend actually returned (name / whatsapp /
 * customer-free). The line is intentionally compact and
 * low-contrast — the row's information weight is in the title.
 */
function composeCustomerLine(task: DashboardTask): string | null {
  if (!task.customer) return null;
  const parts: string[] = [];
  if (
    typeof task.customer.name === "string" &&
    task.customer.name.trim().length > 0
  ) {
    parts.push(task.customer.name);
  }
  if (
    typeof task.customer.whatsappNumber === "string" &&
    task.customer.whatsappNumber.trim().length > 0
  ) {
    parts.push(task.customer.whatsappNumber);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function DashboardTaskRow({ task }: { task: DashboardTask }) {
  const href = TASK_TYPE_ROUTES[task.type];
  const cta = TASK_TYPE_CTA[task.type];
  const pillLabel = TASK_TYPE_PILL_LABEL[task.type];
  const customerLine = composeCustomerLine(task);
  const hasSummary = task.summary.trim().length > 0;

  return (
    <li>
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5 sm:py-4">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <div className="hidden h-9 w-9 shrink-0 items-center justify-center sm:flex">
            <span
              aria-hidden="true"
              className="block h-5 w-px rounded-full bg-divider"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <TaskTypePill type={task.type} />
            <p className="text-[15px] font-medium leading-snug text-foreground">
              {task.title}
            </p>
            {hasSummary ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {task.summary}
              </p>
            ) : null}
            {customerLine ? (
              <p className="pt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                <span className="text-foreground/70">{customerLine}</span>
              </p>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 sm:pl-2">
          <Link
            href={href}
            className="group inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-2 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:h-9 sm:w-auto sm:px-3.5"
            aria-label={`${pillLabel} — ${cta}`}
          >
            <span>{cta}</span>
            <ArrowRight
              aria-hidden="true"
              size={14}
              strokeWidth={1.75}
              className="text-muted-foreground transition-colors group-hover:text-primary"
            />
          </Link>
        </div>
      </div>
    </li>
  );
}
