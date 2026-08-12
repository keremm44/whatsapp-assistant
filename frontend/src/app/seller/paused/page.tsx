import { PausedListPanel } from "@/components/seller/paused/paused-list-panel";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";
import { resolveConversationListFromSession } from "@/lib/seller/conversations-server";

/**
 * Yanıtı Durdurulanlar — a recognition queue, not a second
 * Conversations workbench.
 *
 * Server Component. The list is resolved from
 * `GET /seller/conversations?control_state=ASSISTANT_PAUSED`.
 * The only row action is opening the existing conversation.
 */
export default async function SellerPausedPage() {
  const bootstrap = await resolveConversationListFromSession({
    controlState: "ASSISTANT_PAUSED",
  });

  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption="Asistan"
        title="Yanıtı Durdurulanlar"
        description="Asistanın şu anda yeni mesajlara yanıt vermediği konuşmaları görün."
      />

      <div className="mt-8">
        <Surface className="mx-auto max-w-3xl overflow-hidden">
          <PausedListPanel bootstrap={bootstrap} />
        </Surface>
      </div>
    </PageContainer>
  );
}
