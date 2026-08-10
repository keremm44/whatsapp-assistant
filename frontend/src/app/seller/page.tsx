import * as React from "react";

import { AccessUnavailable } from "@/components/auth/access-unavailable";
import { DashboardHeader } from "@/components/seller/dashboard/dashboard-header";
import { DashboardLayout } from "@/components/seller/dashboard/dashboard-layout";
import { EmptyAttention } from "@/components/seller/dashboard/empty-attention";
import { PriorityCard } from "@/components/seller/dashboard/priority-card";
import { QuietSummary } from "@/components/seller/dashboard/quiet-summary";
import { SecondaryRow } from "@/components/seller/dashboard/secondary-row";
import { PageContainer } from "@/components/shared/page-container";

import { resolveDashboardTasksFromSession } from "@/lib/seller/dashboard-tasks-server";
import type { DashboardTask } from "@/lib/seller/dashboard-tasks";

/**
 * Seller dashboard — the seller's daily attention surface.
 *
 * Server Component. The page resolves the seller's action queue
 * server-side from `GET /seller/dashboard/tasks` using the same
 * Supabase session the auth foundation and seller bootstrap
 * just validated. There is no client hydration, no skeleton, and
 * no secondary fetch. The data layer (`resolveDashboardTasksFromSession`,
 * `lib/seller/dashboard-tasks.ts`) is unchanged.
 *
 * Information architecture (preserved from the previous step):
 *
 *   The backend exposes a user-facing priority categorization on
 *   each task: `priority: "high" | "normal"`. The SQL read model
 *   defines the fixed mapping:
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
 *   Tasks within each section keep the backend's order; the
 *   frontend never re-sorts.
 *
 * Visual character (this step):
 *
 *   - Two-column desktop composition. The high-priority column
 *     on the left holds the cards the seller is supposed to
 *     act on first; the secondary column on the right holds a
 *     compact list of "bugün bakılabilecekler" rows and a
 *     quiet summary panel. The composition is deliberately
 *     NOT a three-column CRM.
 *
 *   - The high-priority column uses individual cards. Each card
 *     has an icon field keyed to the backend task TYPE (not
 *     the priority), so the card reads as a category anchor,
 *     not as an urgency widget. We do not paint the whole
 *     column in petrol; the petrol cue is contained to the
 *     category glyph and the page header hairline.
 *
 *   - The secondary column is a compact, low-density list. The
 *     whole row is a Link; the chevron appears only on
 *     hover/focus, so the rows stay calm at rest.
 *
 *   - The factual count badge in the header is the
 *     backend-provided `toplam` aggregate, rendered as
 *     "İlgilenmeniz gereken N konu" so the user can see at a
 *     glance how many items the action queue contains. The
 *     badge is rendered as a piece of page furniture, not as
 *     a KPI tile. When the queue is empty the badge is
 *     omitted. The badge is deliberately not labeled "Bugün"
 *     because the backend does not provide a "today"
 *     aggregate — `toplam` is the current queue size, not a
 *     daily total.
 *
 *   - Mobile (< lg) collapses to a single column. The
 *     high-priority cards stack first, then the secondary
 *     list, then the summary panel.
 *
 *   - Empty state is its own surface (`EmptyAttention`). It
 *     reads as a quiet, well-deserved pause — not a placeholder.
 *
 *   - Error state is delegated to `AccessUnavailable` exactly
 *     as before. The retry semantics, the no-signOut contract,
 *     and the failure copy are unchanged.
 */
export default async function SellerOverviewPage() {
  const bootstrap = await resolveDashboardTasksFromSession();

  if (bootstrap.state !== "ready") {
    return (
      <PageContainer className="py-8 sm:py-10">
        <DashboardHeader total={0} />
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
      <DashboardHeader total={total} />

      {hasTasks ? (
        <DashboardLayout
          primary={
            <PrimaryColumn
              id="section-once-bunlar"
              title="Önce bunlar"
              count={highTasks.length}
              tasks={highTasks}
            />
          }
          secondary={
            normalTasks.length > 0 ? (
              <SecondaryColumn
                id="section-bugun-bakilabilecekler"
                title="Bugün bakılabilecekler"
                count={normalTasks.length}
                tasks={normalTasks}
              />
            ) : null
          }
          summary={<QuietSummary tasks={tasks} total={total} />}
        />
      ) : (
        <div className="mt-8">
          <EmptyAttention />
        </div>
      )}
    </PageContainer>
  );
}

/**
 * The high-priority column. Renders the section header
 * inline (the shared SectionHeader does not get a custom
 * children slot for a single caller) followed by a stack of
 * `PriorityCard`s. A short, calm description sets the
 * reading frame for the seller.
 */
function PrimaryColumn({
  id,
  title,
  count,
  tasks,
}: {
  id: string;
  title: string;
  count: number;
  tasks: DashboardTask[];
}) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <header className="space-y-1.5">
        <div className="flex items-baseline gap-2">
          <h2
            id={id}
            className="font-heading text-[20px] font-medium leading-snug text-foreground sm:text-[22px]"
          >
            {title}
          </h2>
          <span
            aria-hidden="true"
            className="text-[13px] tabular-nums text-muted-foreground"
          >
            · {count}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          İncelemeniz gereken konular.
        </p>
      </header>
      <ul role="list" className="space-y-3">
        {tasks.map((task) => (
          <li key={task.id}>
            <PriorityCard task={task} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The secondary column. Renders the section header plus a
 * compact list of `SecondaryRow`s. The list is rendered
 * inside a single `Surface`-style frame so the right column
 * has a single, calm rectangle to balance the column of
 * cards on the left.
 */
function SecondaryColumn({
  id,
  title,
  count,
  tasks,
}: {
  id: string;
  title: string;
  count: number;
  tasks: DashboardTask[];
}) {
  return (
    <section
      aria-labelledby={id}
      className="overflow-hidden rounded-md border border-border bg-surface shadow-surface"
    >
      <header className="flex items-baseline gap-2 border-b border-divider px-4 py-3 sm:px-5">
        <h2
          id={id}
          className="font-heading text-[15px] font-medium text-foreground sm:text-base"
        >
          {title}
        </h2>
        <span
          aria-hidden="true"
          className="text-[12.5px] tabular-nums text-muted-foreground"
        >
          · {count}
        </span>
      </header>
      <ul role="list">
        {tasks.map((task) => (
          <SecondaryRow key={task.id} task={task} />
        ))}
      </ul>
    </section>
  );
}
