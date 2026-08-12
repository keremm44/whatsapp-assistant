import { UnansweredViewTabs } from "@/components/seller/unanswered/unanswered-view-tabs";
import { UnansweredWorkspace } from "@/components/seller/unanswered/unanswered-workspace";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

import {
  normalizeUnansweredQuestionIdParam,
  normalizeUnansweredViewParam,
} from "@/lib/seller/unanswered-format";
import {
  resolveUnansweredDetailFromSession,
  resolveUnansweredListFromSession,
} from "@/lib/seller/unanswered-server";

/**
 * Cevaplanamayan Sorular — the V1 knowledge-gap workspace.
 *
 * Server Component. The page's intent: when the assistant could not
 * safely answer a customer question, it left it here instead of
 * guessing. For one selected question at a time the seller can see
 * soru → ne kadar sık geldi → müşteriler nasıl sordu → doğru cevap,
 * and either save the seller-approved answer (which the assistant may
 * use when the SAME question comes again — it never messages past
 * conversations) or deliberately dismiss the question.
 *
 * URL-owned state (stable across refresh/back):
 *   ?view=action_required | answered | dismissed | all  → queue tabs
 *                                       (default: action_required)
 *   ?question=<positive group id>    → the selected question's detail
 * Offset is never in the URL: changing the tab drops the selection and
 * restarts pagination from the first page by construction. There is
 * deliberately no search or filter — the backend has no such contract
 * in V1 — and no KPI chrome or tab counts anywhere (the list's
 * `toplam` is a page length, not a global total).
 */
export default async function SellerUnansweredPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = normalizeUnansweredViewParam(params.view);
  const selectedQuestionId = normalizeUnansweredQuestionIdParam(
    params.question,
  );

  const listBootstrap = await resolveUnansweredListFromSession({ view });
  const detailBootstrap =
    selectedQuestionId === null
      ? null
      : await resolveUnansweredDetailFromSession(selectedQuestionId);

  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <PageHeader
        caption="Asistan"
        title="Cevaplanamayan Sorular"
        description="Asistanın emin olmadığı için size bıraktığı soruları inceleyin ve doğru cevabı kaydedin."
      />

      <div className="mt-8 space-y-4">
        <div className="lg:max-w-xl">
          <UnansweredViewTabs activeView={view} />
        </div>

        <Surface className="overflow-hidden">
          <UnansweredWorkspace
            listBootstrap={listBootstrap}
            detailBootstrap={detailBootstrap}
            view={view}
            selectedQuestionId={selectedQuestionId}
          />
        </Surface>
      </div>
    </PageContainer>
  );
}
