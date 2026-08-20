import { LoadingSignal } from "@/components/shared/loading-signal";

/** Public marketing fallback shaped like the real first-screen composition. */
export default function PublicLoading() {
  return (
    <div className="bg-canvas text-foreground">
      <div className="mx-auto grid w-full max-w-[1180px] gap-x-12 gap-y-7 px-4 pb-16 pt-12 md:px-6 md:pb-20 md:pt-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)] lg:grid-rows-[auto_auto] lg:items-center lg:px-8 lg:pb-24">
        <div className="space-y-5 lg:col-start-1 lg:row-start-1">
          <LoadingSignal label="Sayfa hazırlanıyor" />
          <div aria-hidden="true" className="space-y-3">
            <div className="skeleton h-12 w-full max-w-[640px] rounded-sm sm:h-14" />
            <div className="skeleton h-12 w-5/6 max-w-[560px] rounded-sm sm:h-14" />
            <div className="space-y-2.5 pt-2">
              <div className="skeleton h-5 w-full max-w-[580px] rounded-sm" />
              <div className="skeleton h-5 w-4/5 max-w-[470px] rounded-sm" />
            </div>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="overflow-hidden rounded-sheet border border-boundary bg-sunken shadow-surface lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          <div className="flex items-center justify-between gap-3 border-b border-divider bg-chrome px-4 py-3.5 sm:px-5">
            <div className="space-y-2">
              <div className="skeleton h-3.5 w-36 rounded-sm" />
              <div className="skeleton h-3 w-40 rounded-sm" />
            </div>
            <div className="skeleton h-4 w-20 rounded-sm" />
          </div>
          <div className="space-y-3 px-4 py-5 sm:px-6 sm:py-6">
            <div className="skeleton h-14 w-4/5 rounded-control" />
            <div className="skeleton ml-auto h-16 w-4/5 rounded-control" />
            <div className="border-t border-divider pt-4">
              <div className="skeleton h-14 w-3/4 rounded-control" />
              <div className="skeleton ml-auto mt-3 h-20 w-5/6 rounded-control" />
            </div>
          </div>
          <div className="border-t border-divider bg-recessed px-4 py-3.5 sm:px-6">
            <div className="skeleton h-3.5 w-4/5 rounded-sm" />
          </div>
        </div>

        <div
          aria-hidden="true"
          className="flex flex-col items-start gap-3 lg:col-start-1 lg:row-start-2"
        >
          <div className="flex flex-wrap gap-3">
            <div className="skeleton h-12 w-40 rounded-control" />
            <div className="skeleton h-12 w-44 rounded-control" />
          </div>
          <div className="skeleton h-3.5 w-48 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
