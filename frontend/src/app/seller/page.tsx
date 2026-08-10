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

import { resolveDashboardTasksFromSession } from "@/lib/seller/dashboard-tasks-server";
import type { DashboardTask } from "@/lib/seller/dashboard-tasks";

/**
 * Seller dashboard — the seller's daily attention surface.
 *
 * Server Component. The page resolves the seller's action queue
 * server-side from `GET /seller/dashboard/tasks` using the same
 * Supabase session the auth foundation and seller bootstrap just
 * validated. There is no client hydration, no skeleton, and no
 * secondary fetch. The data layer
 * (`resolveDashboardTasksFromSession`,
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
 * Adaptive composition (this pass):
 *
 *   The page must look deliberate in all four data combinations:
 *
 *     A) high>0, normal>0
 *        Two-column desktop. Left column holds "Önce bunlar"
 *        as PriorityCard tiles. Right column holds "Bugün
 *        bakılabilecekler" as a compact list (SecondaryRow)
 *        and a QuietSummary side panel. The right column
 *        has a single shared chrome surface so the column
 *        reads as one composed block.
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
      <DashboardHeader total={total} />

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
  // The side summary panel needs the same per-priority counts
  // that the inline footer would show. We pre-compute them
  // here so the side panel can render the three numbers
  // (high, normal, total) correctly.
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
        <ul
          role="list"
          className="grid grid-cols-1 gap-3 lg:grid-cols-2"
        >
          {normalTasks.map((task) => (
            <li key={task.id}>
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
 * The right-hand secondary panel (scenario A only). Renders
 * the section header and a chrome-toned surface containing
 * the secondary rows. The chrome surface has a thin
 * petrol top hairline so the column reads as a single,
 * branded block.
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
      className="relative overflow-hidden rounded-md border border-border bg-chrome"
    >
      {/*
       * The chrome panel that hosts the secondary list.
       * A thin petrol top hairline is the original framing;
       * a small terracotta corner accent sits in the
       * top-left and connects this panel to the page
       * header's brand motif (long petrol + shorter
       * terracotta). The corner accent is decorative
       * brand architecture, not a status indicator.
       */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-primary"
      />
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-accent"
      />
      <header className="flex items-baseline gap-2 px-4 pb-2 pt-5 sm:px-5">
        <h2
          id={id}
          className="font-heading text-[15px] font-semibold text-foreground sm:text-base"
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
      <ul role="list" className="bg-surface">
        {tasks.map((task) => (
          <SecondaryRow key={task.id} task={task} />
        ))}
      </ul>
    </section>
  );
}
