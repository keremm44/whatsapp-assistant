import { LoadingSignal } from "@/components/shared/loading-signal";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

const staticSkeleton = "skeleton animate-none";

/** Stable Unanswered loading geometry with one restrained activity signal. */
export default function SellerUnansweredLoading() {
  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <div className="relative">
        <PageHeader
          caption="Asistan"
          title="Cevaplanamayan Sorular"
          description="Asistanın emin olmadığı için size bıraktığı soruları inceleyin ve doğru cevabı kaydedin."
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
        aria-label="Cevaplanamayan sorular yükleniyor"
      >
        <span className="sr-only">Cevaplanamayan sorular yükleniyor…</span>
        <div
          aria-hidden="true"
          className={`${staticSkeleton} h-10 w-full max-w-lg rounded-control lg:max-w-xl`}
        />

        <Surface className="overflow-hidden">
          <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ul
              aria-hidden="true"
              className="divide-y divide-divider lg:border-r lg:border-divider"
            >
              {Array.from({ length: 4 }, (_, index) => (
                <li key={index} className="px-4 py-3.5 md:px-5">
                  <span className={`${staticSkeleton} block h-3.5 w-full max-w-64 rounded-sm`} />
                  <span className={`${staticSkeleton} mt-1.5 block h-3.5 w-2/3 rounded-sm`} />
                  <span className={`${staticSkeleton} mt-2 block h-3 w-44 rounded-sm`} />
                </li>
              ))}
            </ul>

            <div
              aria-hidden="true"
              className="hidden min-h-64 items-center justify-center px-5 py-6 lg:flex"
            >
              <div className="max-w-sm space-y-2 text-center">
                <div className={`${staticSkeleton} mx-auto h-4 w-44 rounded-sm`} />
                <div className={`${staticSkeleton} mx-auto h-3 w-72 rounded-sm`} />
              </div>
            </div>
          </div>
        </Surface>
      </div>
    </PageContainer>
  );
}
