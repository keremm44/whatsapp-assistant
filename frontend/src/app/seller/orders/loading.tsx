import { LoadingSignal } from "@/components/shared/loading-signal";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

const staticSkeleton = "skeleton animate-none";

/** Stable Orders loading geometry with one restrained activity signal. */
export default function SellerOrdersLoading() {
  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <div className="relative">
        <PageHeader
          caption="İşler"
          title="Sipariş Bilgileri"
          description="Müşterilerden toplanan sipariş ve baskı bilgilerini inceleyin; üretim için gereken detayları tek yerden görün."
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
        aria-label="Sipariş listesi yükleniyor"
      >
        <span className="sr-only">Sipariş listesi yükleniyor…</span>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between" aria-hidden="true">
          <div className={`${staticSkeleton} h-10 w-full max-w-sm rounded-control lg:w-96`} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className={`${staticSkeleton} h-14 w-full rounded-control sm:w-56`} />
            <div className={`${staticSkeleton} h-14 w-full rounded-control sm:w-64`} />
          </div>
        </div>

        <Surface className="overflow-hidden">
          <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ul
              aria-hidden="true"
              className="divide-y divide-divider lg:border-r lg:border-divider"
            >
              {Array.from({ length: 4 }, (_, index) => (
                <li key={index} className="space-y-2 px-4 py-3.5 md:px-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <div className={`${staticSkeleton} h-3.5 w-32 rounded-sm`} />
                    <div className={`${staticSkeleton} h-3 w-20 rounded-sm`} />
                  </div>
                  <div className={`${staticSkeleton} h-3 w-40 rounded-sm`} />
                </li>
              ))}
            </ul>
            <div
              aria-hidden="true"
              className="hidden min-h-64 items-center justify-center lg:flex"
            >
              <div className={`${staticSkeleton} h-3.5 w-48 rounded-sm`} />
            </div>
          </div>
        </Surface>
      </div>
    </PageContainer>
  );
}
