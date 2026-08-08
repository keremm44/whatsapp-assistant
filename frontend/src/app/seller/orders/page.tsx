import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

export default function SellerOrdersPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        title="Sipariş Bilgileri"
        description="Müşterilerden toplanan sipariş bilgilerini burada inceleyebilirsiniz."
      />
      <div className="mt-6">
        <Surface>
          <EmptyState
            title="Sipariş bilgileri burada listelenecek"
            description="Müşterilerden toplanan sipariş bilgileri tamamlandıkça burada görünecek."
          />
        </Surface>
      </div>
    </PageContainer>
  );
}
