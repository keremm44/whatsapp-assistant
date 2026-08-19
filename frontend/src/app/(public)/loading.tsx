import { LoadingSignal } from "@/components/shared/loading-signal";

/** Public marketing fallback: same Instrument surface, no seller-workspace copy. */
export default function PublicLoading() {
  return (
    <div className="marketing-theme min-h-[70vh] bg-canvas px-4 py-16 text-foreground md:px-6 md:py-20 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1180px] gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] lg:items-center">
        <div className="space-y-6">
          <LoadingSignal label="Sayfa hazırlanıyor" />
          <div aria-hidden="true" className="space-y-4">
            <div className="skeleton h-10 w-full max-w-[520px] rounded-sm" />
            <div className="skeleton h-10 w-4/5 max-w-[460px] rounded-sm" />
            <div className="skeleton h-5 w-full max-w-[560px] rounded-sm" />
          </div>
        </div>

        <div aria-hidden="true" className="rounded-sheet border border-boundary/60 bg-sunken p-5 shadow-surface sm:p-6">
          <div className="space-y-4">
            <div className="skeleton h-4 w-1/3 rounded-sm" />
            <div className="skeleton ml-auto h-16 w-4/5 rounded-control" />
            <div className="skeleton h-16 w-4/5 rounded-control" />
            <div className="skeleton ml-auto h-16 w-3/4 rounded-control" />
          </div>
        </div>
      </div>
    </div>
  );
}
