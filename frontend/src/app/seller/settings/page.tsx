import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

export default function SellerSettingsPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        title="Ayarlar"
        description="Desteklenen hesap ve sistem ayarları bu alanda gösterilecek."
      />
      <div className="mt-6">
        <Surface>
          <EmptyState
            title="Ayarlar burada görünecek"
            description="Hesap ve sistem ayarları desteklendiğinde burada görünecek."
          />
        </Surface>
      </div>
    </PageContainer>
  );
}
