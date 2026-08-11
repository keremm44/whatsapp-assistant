import { ListDetailLayout } from "@/components/shared/list-detail-layout";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

/**
 * Konuşmalar — desktop: list + detail. Mobile: list only.
 *
 * Surface differentiation:
 *   - List column uses a chrome-toned surface (navigation/list region).
 *   - Detail column uses the primary working surface (the actual work area).
 *
 * Both columns keep their persistent Surface because they represent
 * persistent workflow panes. Empty states are calm and structural, not
 * giant placeholders.
 */
export default function SellerConversationsPage() {
  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <PageHeader
        caption="İşler"
        title="Konuşmalar"
        description="WhatsApp konuşmalarını ve mevcut kontrol durumlarını burada inceleyebilirsiniz."
      />

      <div className="mt-8">
        <ListDetailLayout
          list={
            <Surface className="bg-chrome">
              <div className="px-4 pt-4">
                <p className="text-[13px] font-medium text-primary-text">
                  Konuşma listesi
                </p>
              </div>
              <div className="px-4 pb-6 pt-3">
                <p className="text-sm text-muted-foreground">
                  Konuşmalar burada listelenecek.
                </p>
              </div>
            </Surface>
          }
          detail={
            <Surface>
              <div className="px-5 pt-5">
                <p className="text-[13px] font-medium text-primary-text">
                  Mesaj geçmişi
                </p>
              </div>
              <div className="flex min-h-[280px] flex-col items-start justify-center gap-2 px-5 py-10">
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
