import { BusinessSettingsWorkspace } from "@/components/seller/assistant-settings/business-settings-workspace";
import { SellerFeedbackSection } from "@/components/seller/settings/seller-feedback-section";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import {
  GENERAL_SETTINGS_CAPTION,
  GENERAL_SETTINGS_DESCRIPTION,
  GENERAL_SETTINGS_TITLE,
  SESSION_SECTION_DESCRIPTION,
  SESSION_SECTION_TITLE,
} from "@/lib/seller/assistant-settings-format";
import { resolveSellerSettingsFromSession } from "@/lib/seller/assistant-settings-server";

import { LogoutButton } from "./_logout-button";

/**
 * Sistem Ayarları — business information, feedback and the existing session
 * control. Logout semantics stay in `_logout-button.tsx`.
 */
export default async function SellerSettingsPage() {
  const bootstrap = await resolveSellerSettingsFromSession();

  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption={GENERAL_SETTINGS_CAPTION}
        title={GENERAL_SETTINGS_TITLE}
        description={GENERAL_SETTINGS_DESCRIPTION}
      />

      <div className="mt-8 max-w-xl space-y-8">
        <BusinessSettingsWorkspace bootstrap={bootstrap} />
        <SellerFeedbackSection />
        <div className="space-y-2.5">
          <SectionHeader
            title={SESSION_SECTION_TITLE}
            description={SESSION_SECTION_DESCRIPTION}
          />
          <LogoutButton />
        </div>
      </div>
    </PageContainer>
  );
}
