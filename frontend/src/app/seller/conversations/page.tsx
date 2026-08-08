import { ListDetailLayout } from "@/components/shared/list-detail-layout";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

/**
 * Konuşmalar — desktop: list + detail. Mobile: list only.
 *
 * On mobile the detail region is intentionally hidden because the
 * detail lives behind /seller/conversations/[customerId], which is
 * introduced in a later step. The default `showDetailOnMobile` value
 * matches the approved mobile behavior.
 */
export default function SellerConversationsPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        title="Konuşmalar"
        description="WhatsApp konuşmalarını ve mevcut kontrol durumlarını burada inceleyebilirsiniz."
      />

      <div className="mt-6">
        <ListDetailLayout
          list={
            <Surface>
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-1 px-6 py-12 text-center">
                <p className="text-sm font-medium text-foreground">
                  Konuşmalar burada listelenecek
                </p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Müşteri konuşmaları burada görünecek.
                </p>
              </div>
            </Surface>
          }
          detail={
            <Surface>
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-1 px-6 py-12 text-center">
                <p className="text-sm font-medium text-foreground">
                  Bir konuşma seçin
                </p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Mesaj geçmişini ve konuşmanın mevcut kontrol durumunu
                  burada görebilirsiniz.
                </p>
              </div>
            </Surface>
          }
        />
      </div>
    </PageContainer>
  );
}
