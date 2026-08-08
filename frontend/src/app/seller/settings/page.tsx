import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";

export default function SellerSettingsPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption="Sistem"
        title="Ayarlar"
        description="Desteklenen hesap ve sistem ayarları bu alanda gösterilecek."
      />
      <div className="mt-8">
        <EmptyState
          variant="compact"
          caption="Sistem ayarları"
          title="Ayarlar burada görünecek"
          description="Hesap ve sistem ayarları desteklendiğinde burada görünecek."
        />
      </div>
    </PageContainer>
  );
}
