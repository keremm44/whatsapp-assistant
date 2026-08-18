import { LoadingSignal } from "@/components/shared/loading-signal";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

const staticSkeleton = "skeleton animate-none";

/** Stable paused-queue loading geometry with one restrained activity signal. */
export default function SellerPausedLoading() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <div className="relative">
        <PageHeader
          caption="Asistan"
          title="Yanıtı Durdurulanlar"
          description="Asistanın şu anda yanıt vermediği konuşmalar ve nedenleri. Yanıtları yönetmek için konuşmayı açın."
        />
        <LoadingSignal
          compact
          decorative
          className="absolute right-0 top-0 hidden sm:inline-flex"
        />
      </div>

      <div
        className="mt-8"
        role="status"
        aria-label="Yanıtı durdurulan konuşmalar yükleniyor"
      >
        <span className="sr-only">Yanıtı durdurulan konuşmalar yükleniyor…</span>
        <Surface className="overflow-hidden">
          <ul aria-hidden="true" className="divide-y divide-divider">
            {Array.from({ length: 4 }, (_, index) => (
              <li key={index} className="space-y-2 px-4 py-4 md:px-5">
                <div className="flex items-center justify-between gap-4">
                  <div className={`${staticSkeleton} h-3.5 w-32 rounded-sm`} />
                  <div className={`${staticSkeleton} h-3 w-20 rounded-sm`} />
                </div>
                <div className={`${staticSkeleton} h-3 w-full max-w-md rounded-sm`} />
                <div className={`${staticSkeleton} h-3 w-40 rounded-sm`} />
              </li>
            ))}
          </ul>
        </Surface>
      </div>
    </PageContainer>
  );
}
