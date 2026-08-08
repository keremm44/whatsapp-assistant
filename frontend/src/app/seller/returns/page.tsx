import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

export default function SellerReturnsPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        title="İade ve Sorunlar"
        description="Asistanın müşterilerden topladığı iade ve sorun bilgilerini burada inceleyebilirsiniz."
      />
      <div className="mt-6">
        <Surface>
          <EmptyState
            title="İade ve sorun talepleri burada listelenecek"
            description="Asistanın topladığı iade ve sorun bilgileri hazır olduğunda burada görünecek."
          />
        </Surface>
      </div>
    </PageContainer>
  );
}
