import * as React from "react";

import { AccessUnavailable } from "@/components/auth/access-unavailable";
import { CompactTaskCard } from "@/components/seller/dashboard/compact-task-card";
import { DashboardHeader } from "@/components/seller/dashboard/dashboard-header";
import { EmptyAttention } from "@/components/seller/dashboard/empty-attention";
import { PriorityCard } from "@/components/seller/dashboard/priority-card";
import { QuietSummary } from "@/components/seller/dashboard/quiet-summary";
import { SecondaryRow } from "@/components/seller/dashboard/secondary-row";
import { SectionHeading } from "@/components/seller/dashboard/section-heading";
import { PageContainer } from "@/components/shared/page-container";

import { DashboardFreshness } from "@/components/seller/dashboard/dashboard-freshness";
import { resolveDashboardTasksFromSession } from "@/lib/seller/dashboard-tasks-server";
import { buildDashboardFreshnessSignature } from "@/lib/seller/freshness";
import type { DashboardTask } from "@/lib/seller/dashboard-tasks";

const cardEnterDelay = (index: number) => Math.min(index, 4) * 50;

/**
 * Seller dashboard — the seller's daily attention surface.
 *
 * Server Component. The page resolves the seller's action queue
 * server-side from `GET /seller/dashboard/tasks` using the same
 * Supabase session the auth foundation and seller bootstrap just
 * validated. There is no skeleton and no secondary fetch for the
 * first paint. A conservative visible-tab freshness check may later
 * offer an explicit “Yeni bilgiler var / Yenile” refresh. The data
 * layer (`resolveDashboardTasksFromSession`,
 * `lib/seller/dashboard-tasks.ts`) is unchanged.
 *
 * Information architecture (preserved):
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
 * Working Ledger composition (this pass):
 *
 *   The dashboard is today's WORK DOCKET, not a set of widgets.
 *   High- and normal-priority tasks are each a BOUNDED WORK CARD
 *   (hairline edge + soft ambient shadow) stacked with real gutters,
 *   and each card lifts one quiet step on hover/focus (`work-card`).
 *   The card shell lives in the page; the row components carry no
 *   resting border/radius/shadow of their own, so the ledger-row
 *   discipline is preserved INSIDE each card. The side-column summary
 *   stays one quiet divided sheet. Section identity still comes from
 *   typography, not from colour.
 *
 *   Colour discipline: type is communicated by icon + label; the only
 *   colour a task row spends is OXIDE, and only where the backend
 *   type genuinely means seller review / intervention (see
 *   `task-presentation.ts`). Interaction blue belongs to the row's
 *   destination action and to focus.
 *
 * Adaptive composition (preserved from the previous pass):
 *
 *   The page must look deliberate in all four data combinations:
 *
 *     A) high>0, normal>0
 *        Two-column desktop. Left column holds "Önce bunlar"
 *        as PriorityCard tiles. Right column holds "Bugün
 *        bakılabilecekler" as a compact list (SecondaryRow)
 *        and a QuietSummary side panel. The right column
 *        sits on the shared raised surface family so it
 *        reads as one composed block within the workspace.
 *
 *     B) high>0, normal=0
 *        Single column at full content width. "Önce bunlar"
 *        cards fill the page. A QuietSummary inline footer
 *        sits at the bottom (the side panel is omitted
 *        because there is no side column to host it).
 *
 *     C) high=0, normal>0
 *        Single column at full content width. "Bugün
 *        bakılabilecekler" expands to a two-column grid of
 *        CompactTaskCard tiles so the available horizontal
 *        space is used. A QuietSummary inline footer sits
 *        at the bottom.
 *
 *     D) high=0, normal=0
 *        Empty state (EmptyAttention) fills the work
 *        region. No summary is rendered.
 *
 *   The grid never preserves an empty column. The page
 *   always uses the available horizontal space for the
 *   work the backend actually returned.
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

  const hasHigh = highTasks.length > 0;
  const hasNormal = normalTasks.length > 0;

  return (
    <PageContainer className="py-8 sm:py-10">
      <DashboardHeader
        total={total}
        high={highTasks.length}
        normal={normalTasks.length}
      />
      <DashboardFreshness
        signature={buildDashboardFreshnessSignature({ total, tasks })}
      />

      {!hasTasks ? (
        <div className="mt-8">
          <EmptyAttention />
        </div>
      ) : hasHigh && hasNormal ? (
        <TwoColumnLayout
          highTasks={highTasks}
          normalTasks={normalTasks}
          total={total}
        />
      ) : hasHigh ? (
        <HighOnlyLayout highTasks={highTasks} total={total} />
      ) : (
        <NormalOnlyLayout normalTasks={normalTasks} total={total} />
      )}
    </PageContainer>
  );
}

/**
 * Scenario A: both groups have data. Desktop two-column
 * layout. On tablet+mobile the columns stack into a single
 * column with the same order.
 */
function TwoColumnLayout({
  highTasks,
  normalTasks,
  total,
}: {
  highTasks: DashboardTask[];
  normalTasks: DashboardTask[];
  total: number;
}) {
  // QuietSummary receives the fetched page plus the global total
  // so it can tell a complete page from a partial one.
  const summaryTasks = [
    ...highTasks.map((t) => ({ priority: t.priority })),
    ...normalTasks.map((t) => ({ priority: t.priority })),
  ];

  return (
    <div className="mt-8 flex flex-col gap-10 lg:mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
      <PrimaryColumn
        id="section-once-bunlar"
        title="Önce bunlar"
        count={highTasks.length}
        tasks={highTasks}
      />
      <aside className="flex flex-col gap-5 lg:sticky lg:top-20">
        <SecondaryPanel
          id="section-bugun-bakilabilecekler"
          title="Bugün bakılabilecekler"
          count={normalTasks.length}
          tasks={normalTasks}
        />
        <QuietSummary
          tasks={summaryTasks}
          total={total}
          layout="side"
        />
      </aside>
    </div>
  );
}

/**
 * Scenario B: only high-priority tasks. Full content width.
 * The PriorityCard tiles fill the page. A QuietSummary inline
 * footer sits at the bottom. No side column.
 */
function HighOnlyLayout({
  highTasks,
  total,
}: {
  highTasks: DashboardTask[];
  total: number;
}) {
  return (
    <div className="mt-8 flex flex-col gap-10 lg:mt-10">
      <PrimaryColumn
        id="section-once-bunlar"
        title="Önce bunlar"
        count={highTasks.length}
        tasks={highTasks}
      />
      <QuietSummary
        tasks={highTasks.map((t) => ({ priority: t.priority }))}
        total={total}
        layout="inline"
      />
    </div>
  );
}

/**
 * Scenario C: only normal-priority tasks. Full content
 * width. The compact task cards use a two-column grid on
 * `lg+` to fill the available space; single column on
 * smaller screens. Inline summary footer.
 */
function NormalOnlyLayout({
  normalTasks,
  total,
}: {
  normalTasks: DashboardTask[];
  total: number;
}) {
  return (
    <div className="mt-8 flex flex-col gap-10 lg:mt-10">
      <section
        aria-labelledby="section-bugun-bakilabilecekler"
        className="space-y-5"
      >
        <SectionHeading
          id="section-bugun-bakilabilecekler"
          title="Bugün bakılabilecekler"
          count={normalTasks.length}
          description="Vakit varsa ilerleyebileceğiniz konular."
        />
        {/* Quiet work, each as its own bounded card. Two columns on
            lg+ so the available width is used without making quiet
            rows read as full-width attention cards. */}
        <ul
          role="list"
          className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0"
        >
          {normalTasks.map((task, index) => (
            <li
              key={task.id}
              className="work-card card-enter overflow-hidden rounded-sheet bg-raised"
              style={{ animationDelay: `${cardEnterDelay(index)}ms` }}
            >
              <CompactTaskCard task={task} />
            </li>
          ))}
        </ul>
      </section>
      <QuietSummary
        tasks={normalTasks.map((t) => ({ priority: t.priority }))}
        total={total}
        layout="inline"
      />
    </div>
  );
}

/**
 * The high-priority column. Renders the section header
 * inline (the shared SectionHeader does not get a custom
 * children slot for a single caller) followed by a stack
 * of `PriorityCard`s. The cards use a 1-column stack at
 * every breakpoint; the column width is set by the parent
 * grid in the layout components.
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
    <section aria-labelledby={id} className="space-y-5">
      <SectionHeading
        id={id}
        title={title}
        count={count}
        description="İncelemeniz gereken konular."
      />
      {/* High-priority work as individual bounded cards, stacked with
          real gutters. Each card lifts one quiet step on hover/focus. */}
      <ul role="list" className="space-y-3">
        {tasks.map((task, index) => (
          <li
            key={task.id}
            className="work-card card-enter overflow-hidden rounded-sheet bg-raised"
            style={{ animationDelay: `${cardEnterDelay(index)}ms` }}
          >
            <PriorityCard task={task} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The right-hand supporting region (scenario A only): one quiet
 * bordered paper work sheet with an internal rule under its compact
 * heading. It uses the same raised material as the cards on the left,
 * but stays a single divided sheet — normal-priority work is a list,
 * not a stack of attention cards.
 */
function SecondaryPanel({
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
      className="overflow-hidden rounded-sheet bg-raised shadow-surface border border-boundary/60"
    >
      <header className="flex items-baseline gap-2.5 border-b border-divider px-4 py-3.5 sm:px-5">
        <h2
          id={id}
          className="font-heading text-[17px] font-semibold leading-6 text-foreground"
        >
          {title}
        </h2>
        <span
          aria-hidden="true"
          className="type-meta type-figure text-muted-foreground"
        >
          {count}
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
