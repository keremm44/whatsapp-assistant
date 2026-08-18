import { LoadingSignal } from "@/components/shared/loading-signal";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

/** Stable Orders loading geometry with a small branded activity signal. */
export default function SellerOrdersLoading() {
  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <PageHeader
        caption="İşler"
        title="Sipariş Bilgileri"
        description="Müşterilerden toplanan sipariş ve baskı bilgilerini inceleyin; üretim için gereken detayları tek yerden görün."
      />
      <div
        className="mt-8 space-y-4"
        role="status"
        aria-label="Sipariş listesi yükleniyor"
      >
        <span className="sr-only">Sipariş listesi yükleniyor…</span>
        <LoadingSignal decorative compact />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="h-10 w-full max-w-sm animate-pulse rounded-md bg-surface-2/60 lg:w-96" />
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="h-14 w-full animate-pulse rounded-md bg-surface-2/60 sm:w-56" />
            <div className="h-14 w-full animate-pulse rounded-md bg-surface-2/60 sm:w-64" />
          </div>
        </div>
        <Surface className="overflow-hidden">
          <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ul
              aria-hidden="true"
              className="divide-y divide-divider lg:border-r lg:border-divider"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <li key={index} className="space-y-2 px-4 py-3.5 md:px-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="h-3.5 w-32 animate-pulse rounded-sm bg-surface-2/70" />
                    <div className="h-3 w-20 animate-pulse rounded-sm bg-surface-2/50" />
                  </div>
                  <div className="h-3 w-40 animate-pulse rounded-sm bg-surface-2/50" />
                </li>
              ))}
            </ul>
            <div
              aria-hidden="true"
              className="hidden min-h-64 items-center justify-center lg:flex"
            >
              <div className="h-3.5 w-48 animate-pulse rounded-sm bg-surface-2/50" />
            </div>
          </div>
        </Surface>
      </div>
    </PageContainer>
  );
}
