import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

export default function SellerPausedPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        title="Yanıtı Durdurulanlar"
        description="Asistanın yeni mesajlara yanıt vermediği konuşmalar burada görünecek."
      />
      <div className="mt-6">
        <Surface>
          <EmptyState
            title="Yanıtı durdurulan konuşma yok"
            description="Asistan şu anda tüm konuşmalara yanıt veriyor."
          />
        </Surface>
      </div>
    </PageContainer>
  );
}
