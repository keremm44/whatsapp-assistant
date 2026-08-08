import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { Surface } from "@/components/shared/surface";

/**
 * Genel Bakış — "Bugün ilgilenmeniz gerekenler".
 *
 * In this macro pass the page establishes the visual rhythm: header,
 * "Önce bunlar", "Bugün bakılabilecekler", and a low-emphasis
 * "Günün özeti" region. No business data is rendered.
 */
export default function SellerOverviewPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        title="Bugün ilgilenmeniz gerekenler"
        description="Satıcı müdahalesi isteyen konular burada öncelik sırasıyla görünecek."
      />

      <div className="mt-8 flex flex-col gap-8">
        <section aria-labelledby="section-once-bunlar" className="space-y-3">
          <SectionHeader
            id="section-once-bunlar"
            title="Önce bunlar"
            description="İncelemeniz gereken, süresi yaklaşan konular."
          />
          <Surface className="min-h-[160px]">
            <div className="flex min-h-[160px] items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
              Şu anda sizi bekleyen acil bir konu yok.
            </div>
          </Surface>
        </section>

        <section aria-labelledby="section-bugun-bakilabilecekler" className="space-y-3">
          <SectionHeader
            id="section-bugun-bakilabilecekler"
            title="Bugün bakılabilecekler"
            description="Vakit varsa ilerleyebileceğiniz işler."
          />
          <Surface className="min-h-[160px]">
            <div className="flex min-h-[160px] items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
              Bakılabilecek konular burada görünecek.
            </div>
          </Surface>
        </section>

        <section aria-labelledby="section-gunun-ozeti" className="space-y-3">
          <SectionHeader
            id="section-gunun-ozeti"
            title="Günün özeti"
          />
          <Surface className="min-h-[96px]">
            <div className="flex min-h-[96px] items-center justify-center px-6 py-8 text-center text-sm text-muted-foreground">
              Günün özeti burada görünecek.
            </div>
          </Surface>
        </section>
      </div>
    </PageContainer>
  );
}
