import { LoadingSignal } from "@/components/shared/loading-signal";
import { PageContainer } from "@/components/shared/page-container";

/**
 * Shared seller-route fallback.
 *
 * The seller shell stays mounted while the next server route resolves, so
 * navigation keeps its spatial context. Route-specific loading files can
 * still provide richer silhouettes for heavier pages such as Orders,
 * Returns and Unanswered.
 */
export default function SellerLoading() {
  return (
    <PageContainer size="wide" className="py-10 sm:py-12">
      <div aria-busy="true" className="space-y-8">
        <div className="flex min-h-[96px] items-center">
          <LoadingSignal label="Sayfa hazırlanıyor" />
        </div>

        <div aria-hidden="true" className="space-y-6">
          <div className="space-y-3">
            <div className="skeleton h-8 w-full max-w-[360px] rounded-sm" />
            <div className="skeleton h-4 w-full max-w-[520px] rounded-sm" />
            <div className="flex items-center gap-1.5 pt-1">
              <div className="h-px w-8 bg-divider" />
              <div className="h-px w-3 bg-brand/55" />
              <div className="h-px w-5 bg-chrome-foreground/20" />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]">
            <div className="space-y-3 rounded-sheet border border-boundary bg-raised p-5">
              <div className="skeleton h-5 w-1/3 rounded-sm" />
              <div className="skeleton h-4 w-4/5 rounded-sm" />
              <div className="skeleton h-4 w-2/3 rounded-sm" />
              <div className="skeleton h-16 w-full rounded-control" />
            </div>
            <div className="space-y-3 rounded-sheet border border-boundary bg-raised p-5">
              <div className="skeleton h-5 w-1/2 rounded-sm" />
              <div className="skeleton h-4 w-full rounded-sm" />
              <div className="skeleton h-4 w-3/4 rounded-sm" />
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
