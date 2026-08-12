import { ReturnPhotoPreferences } from "@/components/seller/returns/return-photo-preferences";
import { ReturnsIssueTypeFilter } from "@/components/seller/returns/returns-issue-type-filter";
import { ReturnsSearchForm } from "@/components/seller/returns/returns-search-form";
import { ReturnsViewTabs } from "@/components/seller/returns/returns-view-tabs";
import { ReturnsWorkspace } from "@/components/seller/returns/returns-workspace";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

import {
  normalizeReturnIssueTypeParam,
  normalizeReturnRequestIdParam,
  normalizeReturnSearchParam,
  normalizeReturnViewParam,
} from "@/lib/seller/returns-format";
import {
  resolveReturnDetailFromSession,
  resolveReturnListFromSession,
} from "@/lib/seller/returns-server";

/**
 * İade ve Sorunlar — the V1 review workspace for what the assistant
 * collected from customers.
 *
 * Server Component. The page answers, for one selected record at a
 * time: ne oldu → hangi sipariş → kanıt → şu an ne oluyor → satıcıdan
 * bir şey bekleniyor mu. Backed only by the backend's return-issue
 * list/detail contracts; mutations are limited to mark_handled (and
 * the secondary photo-preference settings, which live behind their own
 * dialog so a failure there can never break the operational list).
 *
 * URL-owned state (stable across refresh/back):
 *   ?view=action_required | collecting | handled | all  → queue tabs
 *                                                      (default: action_required)
 *   ?q=<external order number>     → exact backend filter (max 100)
 *   ?type=<canonical issue_type>   → issue-type filter (canonical only)
 *   ?request=<positive id>         → the selected record's detail
 * Offset is never in the URL: any filter change restarts from the
 * first page by construction.
 *
 * There is deliberately no KPI chrome, no global totals anywhere
 * (the list's `toplam` is a page length, not a count), and no
 * approve/reject/refund surface.
 */
export default async function SellerReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = normalizeReturnViewParam(params.view);
  const query = normalizeReturnSearchParam(params.q);
  const issueType = normalizeReturnIssueTypeParam(params.type);
  const selectedRequestId = normalizeReturnRequestIdParam(params.request);

  const listBootstrap = await resolveReturnListFromSession({
    view,
    externalOrderNumber: query,
    issueType,
  });
  const detailBootstrap =
    selectedRequestId === null
      ? null
      : await resolveReturnDetailFromSession(selectedRequestId);

  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <PageHeader
        caption="İşler"
        title="İade ve Sorunlar"
        description="Asistanın topladığı iade ve sorun bilgilerini inceleyin; gereken yerde siz devreye girin."
      />

      <div className="mt-8 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <ReturnsViewTabs
            activeView={view}
            query={query}
            issueType={issueType}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <ReturnsSearchForm
              view={view}
              query={query}
              issueType={issueType}
            />
            <ReturnsIssueTypeFilter
              view={view}
              query={query}
              issueType={issueType}
            />
            <ReturnPhotoPreferences />
          </div>
        </div>

        <Surface className="overflow-hidden">
          <ReturnsWorkspace
            listBootstrap={listBootstrap}
            detailBootstrap={detailBootstrap}
            view={view}
            query={query}
            issueType={issueType}
            selectedRequestId={selectedRequestId}
          />
        </Surface>
      </div>
    </PageContainer>
  );
}
