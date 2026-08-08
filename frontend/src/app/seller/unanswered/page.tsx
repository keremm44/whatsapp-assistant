import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";

export default function SellerUnansweredPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption="Asistan"
        title="Cevaplanamayan Sorular"
        description="Asistanın yanıt vermek yerine size bıraktığı müşteri soruları burada görünecek."
      />
      <div className="mt-8">
        <EmptyState
          variant="compact"
          caption="Cevaplanamayan sorular"
          title="Cevaplanamayan sorular burada listelenecek"
          description="Asistanın yanıt vermek yerine size bıraktığı sorular burada görünecek."
        />
      </div>
    </PageContainer>
  );
}
