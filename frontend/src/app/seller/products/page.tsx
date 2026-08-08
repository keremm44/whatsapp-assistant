import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

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
        title="Ürünler"
        description="Asistanın müşterilere ürünleriniz hakkında verebileceği bilgileri yönetin."
      />
      <div className="mt-6">
        <Surface>
          <EmptyState
            title="Ürünler burada listelenecek"
            description="Asistan için tanımladığınız ürünler burada görünecek."
          />
        </Surface>
      </div>
    </PageContainer>
  );
}
