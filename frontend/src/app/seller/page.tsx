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
 *   The current backend response is one ordered action queue
 *   (priority_rank ASC, updated_at DESC, related_entity_id DESC).
 *   The only `priority` field is the backend's internal sort weight
 *   (`return_review` / `order_review` are `high`,
 *   `unanswered_question` is `normal`). It is NOT a user-facing
 *   categorization like "Önce bunlar" vs "Bugün bakılabilecekler".
 *   The previous two-section priority layout therefore has no
 *   reliable backend support. We render a single
 *   backend-ordered queue under the existing page header and drop
 *   the priority split entirely. Backend ordering is authoritative;
 *   we never re-sort in the frontend.
 *
 *   The "Günün özeti" placeholder is reduced to a single quiet
 *   factual line that uses only the backend-provided `toplam`
 *   aggregate. No revenue, no customer counts, no AI metrics.
 *   If `toplam` is 0 the line is omitted to avoid noise.
 *
 *   The action list lives inside one section. The page header
 *   caption / title / description from the previous placeholder
 *   layout are kept verbatim so the visual character of the
 *   entry point is unchanged.
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

  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption="Genel Bakış"
        title="Bugün ilgilenmeniz gerekenler"
        description="Satıcı müdahalesi isteyen konular burada öncelik sırasıyla görünecek."
      />

      {hasTasks ? (
        <section
          aria-labelledby="section-bugun-bakilacaklar"
          className="mt-10 space-y-3"
        >
          <SectionHeader
            id="section-bugun-bakilacaklar"
            title="Sıradaki işler"
            description="Sistemden gelen sıraya göre, yukarıdan aşağıya ilerleyebilirsiniz."
          />
          <ul
            role="list"
            className="divide-y divide-divider border-t border-divider"
          >
            {tasks.map((task) => (
              <DashboardTaskRow key={task.id} task={task} />
            ))}
          </ul>
        </section>
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

function DashboardTaskRow({ task }: { task: DashboardTask }) {
  const typeLabel = TASK_TYPE_LABELS[task.type];
  const href = TASK_TYPE_ROUTES[task.type];
  const cta = TASK_TYPE_CTA[task.type];
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
          {task.summary ? (
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
