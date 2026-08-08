import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";

/**
 * Ürünler — macro page only. Sub-page of Asistan Ayarları.
 */
export default function SellerProductsPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <div className="mb-4">
        <Link
          href="/seller/assistant-settings"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          ← Asistan Ayarları
        </Link>
      </div>
      <PageHeader
        caption="Asistan Ayarları"
        title="Ürünler"
        description="Asistanın müşterilere ürünleriniz hakkında verebileceği bilgileri yönetin."
      />
      <div className="mt-8">
        <EmptyState
          variant="compact"
          caption="Ürünler"
          title="Ürünler burada listelenecek"
          description="Asistan için tanımladığınız ürünler burada görünecek."
        />
      </div>
    </PageContainer>
  );
}
