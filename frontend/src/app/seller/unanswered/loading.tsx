import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

/**
 * Calm loading state for the Cevaplanamayan Sorular workspace (initial
 * stream-in and tab transitions). Geometry mirrors the page: static
 * header, tabs outline, and the two-pane workspace silhouette (queue
 * rows + detail placeholder) — no giant spinner, no fake questions or
 * names, header position stays stable so switching views never jumps
 * the layout.
 */
export default function SellerUnansweredLoading() {
  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <PageHeader
        caption="Asistan"
        title="Cevaplanamayan Sorular"
        description="Asistanın emin olmadığı için size bıraktığı soruları inceleyin ve doğru cevabı kaydedin."
      />
      <div
        className="mt-8 space-y-4"
        role="status"
        aria-label="Cevaplanamayan sorular yükleniyor"
      >
        <span className="sr-only">Cevaplanamayan sorular yükleniyor…</span>
        <div className="h-10 w-full max-w-lg animate-pulse rounded-md bg-surface-2/60 lg:max-w-xl" />
        <Surface className="overflow-hidden">
          <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ul
              aria-hidden="true"
              className="divide-y divide-divider lg:border-r lg:border-divider"
            >
              {Array.from({ length: 5 }, (_, index) => (
                <li key={index} className="px-4 py-3.5 md:px-5">
                  <span className="block h-3.5 w-full max-w-64 animate-pulse rounded-sm bg-surface-2/70" />
                  <span className="mt-1.5 block h-3.5 w-2/3 animate-pulse rounded-sm bg-surface-2/60" />
                  <span className="mt-2 block h-3 w-44 animate-pulse rounded-sm bg-surface-2/50" />
                  <span className="mt-2 block h-2.5 w-24 animate-pulse rounded-sm bg-surface-2/60" />
                </li>
              ))}
            </ul>
            <div aria-hidden="true" className="hidden px-5 py-6 lg:block">
              <div className="h-3 w-16 animate-pulse rounded-sm bg-surface-2/60" />
              <div className="mt-3 h-5 w-full max-w-sm animate-pulse rounded-sm bg-surface-2/70" />
              <div className="mt-2 h-5 w-2/3 animate-pulse rounded-sm bg-surface-2/60" />
              <div className="mt-4 space-y-2">
                <div className="h-3 w-40 animate-pulse rounded-sm bg-surface-2/50" />
                <div className="h-3 w-48 animate-pulse rounded-sm bg-surface-2/50" />
              </div>
              <div className="mt-7 space-y-2.5 border-t border-divider pt-4">
                <div className="h-3 w-32 animate-pulse rounded-sm bg-surface-2/60" />
                <div className="h-3 w-full max-w-md animate-pulse rounded-sm bg-surface-2/50" />
                <div className="h-3 w-full max-w-xs animate-pulse rounded-sm bg-surface-2/50" />
              </div>
              <div className="mt-7 space-y-2.5 border-t border-divider pt-4">
                <div className="h-3 w-28 animate-pulse rounded-sm bg-surface-2/60" />
                <div className="h-16 w-full animate-pulse rounded-md bg-surface-2/50" />
              </div>
            </div>
          </div>
        </Surface>
      </div>
    </PageContainer>
  );
}
