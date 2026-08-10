import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";

/**
 * Admin landing page.
 *
 * Currently the only admin destination is "Mağazalar". There is
 * no /admin/sellers contract on the backend yet, so the page is
 * a deliberate placeholder. The placeholder copy is calm and
 * neutral; it does not expose implementation jargon (e.g. a
 * missing endpoint) and it does not invent fake data.
 *
 * The page reads as a future home for the seller / store
 * directory. As soon as the backend exposes a real contract,
 * this surface will list real rows. Until then it stays quiet.
 */
export default function AdminHomePage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption="Yönetim"
        title="Mağazalar"
        description="Sistemdeki mağazaları bu alandan takip edeceksiniz."
      />
      <div className="mt-8">
        <EmptyState
          variant="compact"
          caption="Mağazalar"
          title="Mağaza listesi burada görünecek."
          description="Bu alan mağaza yönetimine bağlandığında, sistemdeki mağazalar burada listelenecek."
        />
      </div>
    </PageContainer>
  );
}
