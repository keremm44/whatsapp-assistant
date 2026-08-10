import type { Route } from "next";
import Link from "next/link";

import { AccessUnavailable } from "@/components/auth/access-unavailable";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";

import { resolveDashboardTasksFromSession } from "@/lib/seller/dashboard-tasks-server";
import type { DashboardTask, DashboardTaskType } from "@/lib/seller/dashboard-tasks";

/**
 * Genel Bakış — "Bugün ilgilenmeniz gerekenler".
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
 *   The dashboard preserves the approved two-section IA:
 *
 *     "Önce bunlar"            <- priority === "high"
 *     "Bugün bakılabilecekler"  <- priority === "normal"
 *
 *   Tasks within each section are rendered in the order returned
 *   by the backend (`priority_rank ASC, updated_at DESC,
 *   related_entity_id DESC`). The frontend never re-sorts.
 *
 *   If one section is empty, the section is omitted cleanly. If
 *   both are empty (i.e. `tasks.length === 0` and `toplam === 0`)
 *   the calm empty state replaces the entire work region.
 *
 *   The "Günün özeti" placeholder is reduced to a single quiet
 *   factual line that uses only the backend-provided `toplam`
 *   aggregate. No revenue, no customer counts, no AI metrics.
 *   It is omitted entirely when `toplam === 0` to avoid noise.
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
        <div className="mt-10 flex flex-col gap-10">
          {highTasks.length > 0 ? (
            <DashboardTaskSection
              id="section-once-bunlar"
              title="Önce bunlar"
              description="Sistemden gelen sıraya göre incelemeniz gereken konular."
              tasks={highTasks}
            />
          ) : null}

          {normalTasks.length > 0 ? (
            <DashboardTaskSection
              id="section-bugun-bakilabilecekler"
              title="Bugün bakılabilecekler"
              description="Vakit varsa ilerleyebileceğiniz konular."
              tasks={normalTasks}
            />
          ) : null}
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState
            variant="compact"
            caption="Bugün ilgilenmeniz gerekenler"
            title="Şu anda ilgilenmeniz gereken bir konu yok."
            description="Yeni konular geldiğinde burada görünecek."
          />
        </div>
      )}

      {total > 0 ? (
        <section
          aria-labelledby="section-gunun-ozeti"
          className="mt-10 space-y-2 border-t border-divider pt-5"
        >
          <p className="text-[13px] font-medium text-primary">Günün özeti</p>
          <p className="text-sm text-muted-foreground">
            İlgilenmeniz gereken {total} konu var.
          </p>
        </section>
      ) : null}
    </PageContainer>
  );
}

/**
 * Map a backend task type to the existing seller list route that
 * hosts the work surface for that type. Detail routes do not exist
 * for any of these yet; we deliberately link to the list, which is
 * the safest existing destination.
 */
const TASK_TYPE_LABELS: Record<DashboardTaskType, string> = {
  return_review: "İade / sorun incelemesi",
  order_review: "Sipariş incelemesi",
  unanswered_question: "Yanıt bekleyen soru",
};

const TASK_TYPE_ROUTES: Record<DashboardTaskType, Route> = {
  return_review: "/seller/returns",
  order_review: "/seller/orders",
  unanswered_question: "/seller/unanswered",
};

const TASK_TYPE_CTA: Record<DashboardTaskType, string> = {
  return_review: "İade listesine git",
  order_review: "Sipariş listesine git",
  unanswered_question: "Sorulara git",
};

function DashboardTaskSection({
  id,
  title,
  description,
  tasks,
}: {
  id: string;
  title: string;
  description: string;
  tasks: DashboardTask[];
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <SectionHeader id={id} title={title} description={description} />
      <ul
        role="list"
        className="divide-y divide-divider border-t border-divider"
      >
        {tasks.map((task) => (
          <DashboardTaskRow key={task.id} task={task} />
        ))}
      </ul>
    </section>
  );
}

function DashboardTaskRow({ task }: { task: DashboardTask }) {
  const typeLabel = TASK_TYPE_LABELS[task.type];
  const href = TASK_TYPE_ROUTES[task.type];
  const cta = TASK_TYPE_CTA[task.type];
  // `summary` is proven non-null in the SQL projection, but the
  // raw text may still be empty. We treat empty as absent so the
  // layout does not leave a stranded muted paragraph.
  const customerLine = task.customer
    ? [task.customer.name, task.customer.whatsappNumber]
        .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
        .join(" · ")
    : null;

  return (
    <li className="py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 space-y-1">
          <p className="text-[13px] font-medium text-primary">{typeLabel}</p>
          <p className="text-sm font-medium leading-snug text-foreground">
            {task.title}
          </p>
          {task.summary.trim().length > 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {task.summary}
            </p>
          ) : null}
          {customerLine ? (
            <p className="text-xs text-muted-foreground">{customerLine}</p>
          ) : null}
        </div>
        <div className="shrink-0">
          <Link
            href={href}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={`${typeLabel} — ${cta}`}
          >
            {cta}
          </Link>
        </div>
      </div>
    </li>
  );
}
