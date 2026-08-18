import { LoadingSignal } from "@/components/shared/loading-signal";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

const staticSkeleton = "skeleton animate-none";

/** Stable Returns loading geometry with one restrained activity signal. */
export default function SellerReturnsLoading() {
  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <div className="relative">
        <PageHeader
          caption="İşler"
          title="İade ve Sorunlar"
          description="Asistanın topladığı iade ve sorun bilgilerini inceleyin; gereken yerde siz devreye girin."
        />
        <LoadingSignal
          compact
          decorative
          className="absolute right-0 top-0 hidden sm:inline-flex"
        />
      </div>

      <div
        className="mt-8 space-y-4"
        role="status"
        aria-label="İade ve sorun kayıtları yükleniyor"
      >
        <span className="sr-only">İade ve sorun kayıtları yükleniyor…</span>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between" aria-hidden="true">
          <div className={`${staticSkeleton} h-10 w-full max-w-md rounded-control`} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className={`${staticSkeleton} h-14 w-full rounded-control sm:w-64`} />
            <div className={`${staticSkeleton} h-14 w-full rounded-control sm:w-64`} />
            <div className={`${staticSkeleton} h-10 w-full rounded-control sm:w-44`} />
          </div>
        </div>

        <Surface className="overflow-hidden">
          <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ul
              aria-hidden="true"
              className="divide-y divide-divider lg:border-r lg:border-divider"
            >
              {Array.from({ length: 4 }, (_, index) => (
                <li key={index} className="px-4 py-3.5 md:px-5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={`${staticSkeleton} h-3.5 w-32 rounded-sm`} />
                    <span className={`${staticSkeleton} h-3 w-16 rounded-sm`} />
                  </span>
                  <span className={`${staticSkeleton} mt-2 block h-3 w-full max-w-48 rounded-sm`} />
                  <span className={`${staticSkeleton} mt-2 block h-3 w-40 rounded-sm`} />
                </li>
              ))}
            </ul>

            <div
              aria-hidden="true"
              className="hidden min-h-64 items-center justify-center px-5 py-6 lg:flex"
            >
              <div className="max-w-sm space-y-2 text-center">
                <div className={`${staticSkeleton} mx-auto h-4 w-40 rounded-sm`} />
                <div className={`${staticSkeleton} mx-auto h-3 w-64 rounded-sm`} />
              </div>
            </div>
          </div>
        </Surface>
      </div>
    </PageContainer>
  );
}
