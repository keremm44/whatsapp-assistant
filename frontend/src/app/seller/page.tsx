import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { cn } from "@/lib/utils/cn";

/**
 * Genel Bakış — "Bugün ilgilenmeniz gerekenler".
 *
 * The visual hierarchy is broken into three deliberately different
 * regions:
 *   1. Önce bunlar        — primary work region, headless
 *   2. Bugün bakılabilecekler — secondary work region, slightly less weight
 *   3. Günün özeti        — quiet low-emphasis footer, no card, just a hairline
 */
export default function SellerOverviewPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption="Genel Bakış"
        title="Bugün ilgilenmeniz gerekenler"
        description="Satıcı müdahalesi isteyen konular burada öncelik sırasıyla görünecek."
      />

      <div className="mt-10 flex flex-col gap-10">
        <section aria-labelledby="section-once-bunlar" className="space-y-3">
          <SectionHeader
            id="section-once-bunlar"
            title="Önce bunlar"
            description="İncelemeniz gereken, süresi yaklaşan konular."
          />
          <div className="border-t border-divider pt-4">
            <p className="text-sm text-muted-foreground">
              Öncelikli işler burada listelenecek.
            </p>
          </div>
        </section>

        <section
          aria-labelledby="section-bugun-bakilabilecekler"
          className="space-y-3"
        >
          <SectionHeader
            id="section-bugun-bakilabilecekler"
            title="Bugün bakılabilecekler"
            description="Vakit varsa ilerleyebileceğiniz işler."
          />
          <div className="border-t border-divider pt-4">
            <p className="text-sm text-muted-foreground">
              Bakılabilecek konular burada görünecek.
            </p>
          </div>
        </section>

        <section
          aria-labelledby="section-gunun-ozeti"
          className={cn(
            "space-y-2 border-t border-divider pt-5",
          )}
        >
          <p className="text-[13px] font-medium text-primary">Günün özeti</p>
          <p className="text-sm text-muted-foreground">
            Gerçek veriler bağlandığında günün özeti burada görünecek.
          </p>
        </section>
      </div>
    </PageContainer>
  );
}
