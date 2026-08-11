import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

/**
 * Calm loading state for the Orders worklist (initial stream-in and
 * tab/search transitions). Geometry mirrors the page: static header,
 * toolbar outline and calm row skeletons — no giant spinner, header
 * position stays stable so switching views never jumps the layout.
 */
export default function SellerOrdersLoading() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption="İşler"
        title="Sipariş Bilgileri"
        description="Müşterilerden toplanan sipariş ve baskı bilgilerini tek listede görüntüleyin."
      />
      <div
        className="mt-8 space-y-4"
        role="status"
        aria-label="Sipariş listesi yükleniyor"
      >
        <span className="sr-only">Sipariş listesi yükleniyor…</span>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="h-10 w-full max-w-sm animate-pulse rounded-md bg-surface-2/60 lg:w-96" />
          <div className="h-14 w-full animate-pulse rounded-md bg-surface-2/60 sm:w-64" />
        </div>
        <Surface className="overflow-hidden">
          <ul aria-hidden="true" className="divide-y divide-divider">
            {Array.from({ length: 6 }, (_, index) => (
              <li key={index} className="px-4 py-4 md:px-5">
                <div className="grid gap-x-6 gap-y-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
                  <div className="order-2 h-3.5 w-28 animate-pulse rounded-sm bg-surface-2/70 md:order-1" />
                  <div className="order-1 space-y-1.5 md:order-2">
                    <div className="h-3.5 w-32 animate-pulse rounded-sm bg-surface-2/70" />
                    <div className="h-3 w-24 animate-pulse rounded-sm bg-surface-2/50" />
                  </div>
                  <div className="order-3 h-3.5 w-40 animate-pulse rounded-sm bg-surface-2/70" />
                </div>
              </li>
            ))}
          </ul>
        </Surface>
      </div>
    </PageContainer>
  );
}
