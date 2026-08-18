import { MessageCircle } from "lucide-react";

import { ConversationsWorkbench } from "@/components/seller/conversations/conversations-workbench";
import { LoadingSignal } from "@/components/shared/loading-signal";
import { PageContainer } from "@/components/shared/page-container";

const staticSkeleton = "skeleton animate-none";

export default function ConversationsLoading() {
  return (
    <PageContainer size="wide" className="py-4 md:pb-0 md:pt-6">
      <ConversationsWorkbench
        mobileView="list"
        hasContextRail={false}
        list={
          <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
            <header className="px-4 pb-0 pt-4 md:pt-5">
              <div className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h1 className="font-heading text-[19px] font-semibold leading-6 text-foreground">
                    Konuşmalar
                  </h1>
                  <LoadingSignal compact decorative />
                </div>
                <p className="flex items-center gap-1.5 type-meta text-muted-foreground">
                  <MessageCircle aria-hidden="true" size={13} strokeWidth={1.75} />
                  <span>WhatsApp yazışmaları</span>
                </p>
              </div>

              <div
                aria-hidden="true"
                className="mt-3 flex gap-4 border-b border-boundary"
              >
                <span className="flex min-h-11 items-center px-0.5 pb-2 pt-1 type-row-secondary text-muted-foreground md:min-h-9">
                  Tümü
                </span>
                <span className="flex min-h-11 items-center px-0.5 pb-2 pt-1 type-row-secondary text-muted-foreground md:min-h-9">
                  İlgilenmeniz gerekenler
                </span>
              </div>
            </header>

            <div aria-hidden="true" className="min-h-0 flex-1 md:overflow-hidden">
              <ul className="divide-y divide-divider">
                {Array.from({ length: 5 }).map((_, index) => (
                  <li key={index} className="space-y-2 px-4 py-4">
                    <div className={`${staticSkeleton} h-4 w-2/5 rounded-sm`} />
                    <div className={`${staticSkeleton} h-3 w-4/5 rounded-sm`} />
                    <div className={`${staticSkeleton} h-3 w-1/3 rounded-sm`} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        }
        center={
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 py-16 text-center">
            <p className="type-record-identity text-foreground">
              Bir WhatsApp konuşması seçin
            </p>
            <p className="max-w-sm type-body text-muted">
              Mesaj geçmişini, konuşmanın kimin sorumluluğunda olduğunu ve varsa
              ilgili sipariş veya iade bağlamını burada görebilirsiniz.
            </p>
          </div>
        }
      />
    </PageContainer>
  );
}
