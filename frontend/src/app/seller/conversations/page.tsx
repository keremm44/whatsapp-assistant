import { EmptyState } from "@/components/shared/empty-state";
import { ListDetailLayout } from "@/components/shared/list-detail-layout";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

/**
 * Konuşmalar — desktop: list + detail. Mobile: list only.
 *
 * No data is connected in this step. The macro is in place so a future
 * conversation contract can drop into the same shape.
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
              <EmptyState
                title="Konuşmalar burada listelenecek"
                description="Henüz görüntülenecek bir konuşma yok."
              />
            </Surface>
          }
          detail={
            <Surface>
              <EmptyState
                title="Bir konuşma seçin"
                description="Mesaj geçmişini ve konuşmanın mevcut kontrol durumunu burada görebilirsiniz."
              />
            </Surface>
          }
        />
      </div>
    </PageContainer>
  );
}
