import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";

export default function SellerReturnsPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption="İşler"
        title="İade ve Sorunlar"
        description="Asistanın müşterilerden topladığı iade ve sorun bilgilerini burada inceleyebilirsiniz."
      />
      <div className="mt-8">
        <EmptyState
          variant="compact"
          caption="İade ve sorunlar"
          title="İade ve sorun bilgileri burada listelenecek"
          description="Asistanın topladığı iade ve sorun bilgileri hazır olduğunda burada görünecek."
        />
      </div>
    </PageContainer>
  );
}
