import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";

import { LogoutButton } from "./_logout-button";

/**
 * Seller settings page.
 *
 * The page header ("Ayarlar") is preserved from the previous layout
 * so the navigation context remains consistent. The body is the
 * "Oturum" section: a single, calm control that lets the seller
 * close the current Supabase session. The interactive button itself
 * is a small Client Component (`./_logout-button`).
 *
 * Additional settings sections will be added below this one in
 * later steps. This page is a Server Component — the only client
 * island is the logout button.
 */
export default function SellerSettingsPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption="Sistem"
        title="Ayarlar"
        description="Desteklenen hesap ve sistem ayarları bu alanda gösterilecek."
      />

      <div className="mt-8 max-w-xl space-y-2.5">
        <SectionHeader
          title="Oturum"
          description="Bu cihazdaki oturumunuzu güvenli şekilde kapatabilirsiniz."
        />
        <LogoutButton />
      </div>
    </PageContainer>
  );
}
