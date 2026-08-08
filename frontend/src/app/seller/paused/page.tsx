import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";

export default function SellerPausedPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption="Asistan"
        title="Yanıtı Durdurulanlar"
        description="Asistanın yeni mesajlara yanıt vermediği konuşmalar burada görünecek."
      />
      <div className="mt-8">
        <EmptyState
          variant="compact"
          caption="Yanıtı durdurulanlar"
          title="Yanıtı durdurulan konuşmalar burada listelenecek"
          description="Asistanın yanıt vermediği konuşmalar burada görünecek."
        />
      </div>
    </PageContainer>
  );
}
