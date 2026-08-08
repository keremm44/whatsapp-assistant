import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

export default function SellerUnansweredPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        title="Cevaplanamayan Sorular"
        description="Asistanın yanıt vermek yerine size bıraktığı müşteri soruları burada görünecek."
      />
      <div className="mt-6">
        <Surface>
          <EmptyState
            title="Cevaplanamayan soru yok"
            description="Asistan şu anda tüm gelen soruları yanıtlayabiliyor."
          />
        </Surface>
      </div>
    </PageContainer>
  );
}
