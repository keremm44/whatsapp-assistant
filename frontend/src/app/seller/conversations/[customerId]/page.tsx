import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessUnavailable } from "@/components/auth/access-unavailable";
import { ConversationDetailPanel } from "@/components/seller/conversations/conversation-detail-panel";
import { ConversationListPanel } from "@/components/seller/conversations/conversation-list-panel";
import { ConversationsWorkbench } from "@/components/seller/conversations/conversations-workbench";
import {
  ConversationContextRail,
  hasConversationContext,
} from "@/components/seller/conversations/context-rail";
import { PageContainer } from "@/components/shared/page-container";

import {
  resolveConversationListFromSession,
  resolveConversationWorkspaceFromSession,
} from "@/lib/seller/conversations-server";
import { conversationsListHref } from "@/lib/seller/conversations-format";

/**
 * Konuşmalar — selected conversation route.
 *
 * Server Component. Resolves TWO things in parallel with the same
 * server session:
 *   - the conversation queue (so the desktop left column stays in
 *     place and the workbench never feels like an unrelated page),
 *   - the workspace bundle for the selected customer: the detail
 *     read model (`GET /seller/conversations/{id}`) plus the
 *     authoritative control presentation (`GET .../control`).
 *
 * Failure semantics:
 *   - The queue failing never takes the conversation down, and vice
 *     versa; each region renders its own calm state.
 *   - Control failure degrades the header to a retryable area while
 *     the message history keeps rendering.
 *   - Nothing here signs the seller out; a transient backend or
 *     network failure leaves the valid Supabase session untouched.
 *
 * The right rail renders ONLY when the conversation actually carries
 * work context (active order, active return/issue, or open
 * unanswered questions). Below xl the same rail content opens from
 * the conversation header's "Bağlam" trigger in a Sheet.
 */
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

  const [listBootstrap, workspace] = await Promise.all([
    resolveConversationListFromSession({ attentionOnly }),
    resolveConversationWorkspaceFromSession(customerId),
  ]);

  const detail = workspace.state === "ready" ? workspace.detail : null;
  const hasContext = detail !== null && hasConversationContext(detail);
  const railNode = detail && hasContext ? (
    <ConversationContextRail
      order={detail.activeOrder}
      returnIssue={detail.activeReturnIssue}
      unanswered={detail.openUnanswered}
    />
  ) : null;

  return (
    <PageContainer size="wide" className="py-4 md:pb-0 md:pt-6">
      <ConversationsWorkbench
        mobileView="detail"
        hasContextRail={hasContext}
        list={
          <ConversationListPanel
            bootstrap={listBootstrap}
            attentionOnly={attentionOnly}
            selectedCustomerId={customerId}
          />
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
              <p className="text-sm font-medium text-foreground">
                Konuşma bulunamadı
              </p>
              <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                Bu konuşma mevcut değil ya da bu mağazaya ait değil.
              </p>
              <Link
                href={conversationsListHref(attentionOnly) as Route}
                className="mt-1 text-[13px] font-medium text-primary-text underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
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
