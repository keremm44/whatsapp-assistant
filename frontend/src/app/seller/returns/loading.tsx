import { LoadingSignal } from "@/components/shared/loading-signal";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

/** Stable returns loading geometry with a small branded activity signal. */
export default function SellerReturnsLoading() {
  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <PageHeader
        caption="İşler"
        title="İade ve Sorunlar"
        description="Asistanın topladığı iade ve sorun bilgilerini inceleyin; gereken yerde siz devreye girin."
      />
      <div
        className="mt-8 space-y-4"
        role="status"
        aria-label="İade ve sorun kayıtları yükleniyor"
      >
        <span className="sr-only">İade ve sorun kayıtları yükleniyor…</span>
        <LoadingSignal decorative compact />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="h-10 w-full max-w-md animate-pulse rounded-md bg-surface-2/60" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="h-14 w-full animate-pulse rounded-md bg-surface-2/60 sm:w-64" />
            <div className="h-14 w-full animate-pulse rounded-md bg-surface-2/60 sm:w-64" />
            <div className="h-10 w-full animate-pulse rounded-md bg-surface-2/60 sm:w-44" />
          </div>
        </div>
        <Surface className="overflow-hidden">
          <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ul
              aria-hidden="true"
              className="divide-y divide-divider lg:border-r lg:border-divider"
            >
              {Array.from({ length: 5 }, (_, index) => (
                <li key={index} className="px-4 py-3.5 md:px-5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="h-3.5 w-32 animate-pulse rounded-sm bg-surface-2/70" />
                    <span className="h-3 w-16 animate-pulse rounded-sm bg-surface-2/50" />
                  </span>
                  <span className="mt-2 block h-3 w-full max-w-48 animate-pulse rounded-sm bg-surface-2/60" />
                  <span className="mt-2 block h-3 w-40 animate-pulse rounded-sm bg-surface-2/50" />
                  <span className="mt-2 block h-2.5 w-24 animate-pulse rounded-sm bg-surface-2/60" />
                </li>
              ))}
            </ul>
            <div aria-hidden="true" className="hidden px-5 py-6 lg:block">
              <div className="h-3 w-24 animate-pulse rounded-sm bg-surface-2/60" />
              <div className="mt-3 h-5 w-44 animate-pulse rounded-sm bg-surface-2/70" />
              <div className="mt-3 h-3 w-full max-w-md animate-pulse rounded-sm bg-surface-2/60" />
              <div className="mt-2 h-3 w-full max-w-sm animate-pulse rounded-sm bg-surface-2/50" />
              <div className="mt-7 space-y-2.5 border-t border-divider pt-4">
                <div className="h-3 w-20 animate-pulse rounded-sm bg-surface-2/60" />
                <div className="h-3 w-full max-w-xs animate-pulse rounded-sm bg-surface-2/50" />
                <div className="h-3 w-full max-w-56 animate-pulse rounded-sm bg-surface-2/50" />
              </div>
              <div className="mt-7 space-y-2.5 border-t border-divider pt-4">
                <div className="h-3 w-20 animate-pulse rounded-sm bg-surface-2/60" />
                <div className="h-3 w-full max-w-52 animate-pulse rounded-sm bg-surface-2/50" />
              </div>
            </div>
          </div>
        </Surface>
      </div>
    </PageContainer>
  );
}
