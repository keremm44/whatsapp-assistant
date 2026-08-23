import { OnboardingWorkspace } from "@/components/seller/onboarding/onboarding-workspace";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { resolveOnboardingFromSession } from "@/lib/seller/onboarding-server";

export default async function SellerOnboardingPage() {
  const bootstrap = await resolveOnboardingFromSession();

  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption="Sistem kurulumu"
        title="Kurulum"
        description="İşletme, ürün, kargo, iade ve bağlantı adımlarını backend’in doğrulama sırasına göre tamamlayın."
      />
      <OnboardingWorkspace bootstrap={bootstrap} />
    </PageContainer>
  );
}
