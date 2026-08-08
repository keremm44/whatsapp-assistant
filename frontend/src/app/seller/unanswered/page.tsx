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
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-1 px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">
              Cevaplanamayan sorular burada listelenecek
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Asistanın yanıt vermek yerine size bıraktığı sorular burada
              görünecek.
            </p>
          </div>
        </Surface>
      </div>
    </PageContainer>
  );
}
