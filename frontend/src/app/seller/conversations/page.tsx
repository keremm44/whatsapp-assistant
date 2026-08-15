import { ConversationListPanel } from "@/components/seller/conversations/conversation-list-panel";
import { ConversationsWorkbench } from "@/components/seller/conversations/conversations-workbench";
import { PageContainer } from "@/components/shared/page-container";

import { resolveConversationListFromSession } from "@/lib/seller/conversations-server";

/**
 * Konuşmalar — the seller's operational workbench (index route).
 *
 * Server Component. The queue is resolved server-side from
 * `GET /seller/conversations` using the same Supabase session the
 * seller layout's auth guard just validated; the left column owns the
 * "Konuşmalar" title and the two filters, so no decorative page
 * header burns workbench height above the real work area.
 *
 * Filters: the only V1 filter is `?filter=attention`, which maps 1:1
 * onto the backend's `attention_only=true`. Anything else (or no
 * param) is the default "Tümü" view (attention_only=false). The
 * backend owns the ordering; the frontend never re-sorts.
 *
 * On desktop the center column shows the calm "Bir WhatsApp konuşması seçin"
 * state; on mobile this route is the queue itself and the detail
 * lives at /seller/conversations/[customerId].
 */
export default async function SellerConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const attentionOnly = params.filter === "attention";

  const bootstrap = await resolveConversationListFromSession({
    attentionOnly,
  });

  return (
    <PageContainer size="wide" className="py-4 md:pb-0 md:pt-6">
      <ConversationsWorkbench
        mobileView="list"
        hasContextRail={false}
        list={
          <ConversationListPanel
            bootstrap={bootstrap}
            attentionOnly={attentionOnly}
            selectedCustomerId={null}
          />
        }
        center={
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 py-16 text-center">
            <p className="type-record-identity text-foreground">
              Bir WhatsApp konuşması seçin
            </p>
            <p className="max-w-sm type-body text-muted">
              Mesaj geçmişini, konuşmanın kimin sorumluluğunda olduğunu
              ve varsa ilgili sipariş veya iade bağlamını burada
              görebilirsiniz.
            </p>
          </div>
        }
      />
    </PageContainer>
  );
}
