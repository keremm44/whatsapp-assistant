import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessUnavailable } from "@/components/auth/access-unavailable";
import { ConversationDetailPanel } from "@/components/seller/conversations/conversation-detail-panel";
import { ConversationListPanel } from "@/components/seller/conversations/conversation-list-panel";
import { ConversationsWorkbench } from "@/components/seller/conversations/conversations-workbench";
import { ConversationContextRail } from "@/components/seller/conversations/context-rail";
import { WorkbenchScrollMemory } from "@/components/seller/navigation/workbench-scroll-memory";
import { PageContainer } from "@/components/shared/page-container";

import {
  resolveConversationListFromSession,
  resolveConversationWorkspaceFromSession,
} from "@/lib/seller/conversations-server";
import {
  conversationsListHref,
  hasConversationContext,
} from "@/lib/seller/conversations-format";

export default async function SellerConversationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { customerId: rawCustomerId } = await params;
  if (!/^\d+$/.test(rawCustomerId)) {
    notFound();
  }
  const customerId = Number(rawCustomerId);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) {
    notFound();
  }

  const query = await searchParams;
  const attentionOnly = query.filter === "attention";
  const navigationContext = attentionOnly ? "attention" : "all";

  const [listBootstrap, workspace] = await Promise.all([
    resolveConversationListFromSession({ attentionOnly }),
    resolveConversationWorkspaceFromSession(customerId),
  ]);

  const detail = workspace.state === "ready" ? workspace.detail : null;
  const aiContext = workspace.state === "ready" ? workspace.aiContext : null;
  const hasContext =
    detail !== null && (hasConversationContext(detail) || aiContext !== null);
  const railNode = detail && hasContext ? (
    <ConversationContextRail
      order={detail.activeOrder}
      returnIssue={detail.activeReturnIssue}
      unanswered={detail.openUnanswered}
      controlHistory={detail.controlHistory}
      aiContext={aiContext}
      renderedAt={workspace.state === "ready" ? workspace.renderedAt : Date.now()}
    />
  ) : null;

  return (
    <PageContainer size="wide" className="py-4 md:pb-0 md:pt-6">
      <ConversationsWorkbench
        mobileView="detail"
        hasContextRail={hasContext}
        list={
          <WorkbenchScrollMemory
            namespace="conversations"
            context={navigationContext}
            trackViewport={false}
            resetPathname="/seller/conversations"
          >
            <ConversationListPanel
              bootstrap={listBootstrap}
              attentionOnly={attentionOnly}
              selectedCustomerId={customerId}
            />
          </WorkbenchScrollMemory>
        }
        center={
          workspace.state === "ready" && detail ? (
            <ConversationDetailPanel
              customerId={customerId}
              detail={detail}
              initialControl={workspace.control}
              renderedAt={workspace.renderedAt}
              attentionOnly={attentionOnly}
              hasContext={hasContext}
              contextRail={railNode}
            />
          ) : workspace.state === "not_found" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <p className="type-record-identity text-foreground">
                Konuşma bulunamadı
              </p>
              <p className="max-w-sm type-body text-muted">
                Bu konuşma mevcut değil ya da bu mağazaya ait değil.
              </p>
              <Link
                href={conversationsListHref(attentionOnly) as Route}
                className="mt-1 inline-flex min-h-11 items-center rounded-control type-row-secondary font-semibold text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:min-h-0"
              >
                Konuşmalara geri dön
              </Link>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 py-10">
              <AccessUnavailable compact contextLabel="Konuşma" />
            </div>
          )
        }
        rail={railNode}
      />
    </PageContainer>
  );
}
