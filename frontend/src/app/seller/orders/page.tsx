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
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-1 px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">
              Sipariş bilgileri burada listelenecek
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Müşterilerden toplanan sipariş bilgileri burada görünecek.
            </p>
          </div>
        </Surface>
      </div>
    </PageContainer>
  );
}
