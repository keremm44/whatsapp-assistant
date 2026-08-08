import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";

export default function SellerOrdersPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption="İşler"
        title="Sipariş Bilgileri"
        description="Müşterilerden toplanan sipariş bilgilerini burada inceleyebilirsiniz."
      />
      <div className="mt-8">
        <EmptyState
          variant="compact"
          caption="Siparişler"
          title="Sipariş bilgileri burada listelenecek"
          description="Müşterilerden toplanan sipariş bilgileri burada görünecek."
        />
      </div>
    </PageContainer>
  );
}
