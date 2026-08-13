import { AssistantSettingsHub } from "@/components/seller/assistant-settings/assistant-settings-hub";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import {
  HUB_PAGE_CAPTION,
  HUB_PAGE_DESCRIPTION,
  HUB_PAGE_TITLE,
} from "@/lib/seller/assistant-settings-hub";
import { resolveAssistantSettingsHubFromSession } from "@/lib/seller/assistant-settings-hub-server";

/**
 * Asistan Ayarları — read-only hub for the four child workspaces.
 *
 * Summaries are derived from existing GET contracts. One unavailable
 * source never blanks the other cards.
 */
export default async function SellerAssistantSettingsPage() {
  const bootstrap = await resolveAssistantSettingsHubFromSession();

  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption={HUB_PAGE_CAPTION}
        title={HUB_PAGE_TITLE}
        description={HUB_PAGE_DESCRIPTION}
      />
      <AssistantSettingsHub bootstrap={bootstrap} />
    </PageContainer>
  );
}
