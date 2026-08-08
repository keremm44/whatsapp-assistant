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
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-1 px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">
              İade ve sorun bilgileri burada listelenecek
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Asistanın topladığı iade ve sorun bilgileri hazır olduğunda
              burada görünecek.
            </p>
          </div>
        </Surface>
      </div>
    </PageContainer>
  );
}
