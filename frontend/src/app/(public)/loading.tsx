import { LoadingSignal } from "@/components/shared/loading-signal";

/** Public marketing fallback shaped like the ownership-ledger first view. */
export default function PublicLoading() {
  return (
    <div className="bg-canvas text-foreground">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-14 pt-12 md:px-6 md:pb-20 md:pt-20 lg:px-8 lg:pb-24">
        <div className="max-w-[900px] space-y-5">
          <LoadingSignal label="Sayfa hazırlanıyor" />
          <div aria-hidden="true" className="space-y-3">
            <div className="skeleton h-12 w-full max-w-[760px] rounded-sm sm:h-14" />
            <div className="skeleton h-12 w-4/5 max-w-[640px] rounded-sm sm:h-14" />
            <div className="pt-2 space-y-2.5">
              <div className="skeleton h-5 w-full max-w-[620px] rounded-sm" />
              <div className="skeleton h-5 w-4/5 max-w-[500px] rounded-sm" />
            </div>
          </div>
        </div>

        <div aria-hidden="true" className="pt-12 sm:pt-14">
          <div className="flex items-end justify-between gap-8 border-b border-divider pb-4">
            <div className="space-y-2">
              <div className="skeleton h-3 w-28 rounded-sm" />
              <div className="skeleton h-6 w-52 rounded-sm" />
            </div>
            <div className="hidden space-y-2 sm:block">
              <div className="skeleton ml-auto h-3.5 w-64 rounded-sm" />
              <div className="skeleton ml-auto h-3.5 w-52 rounded-sm" />
            </div>
          </div>

          {["08:42", "09:17", "10:21", "11:03"].map((time, index) => (
            <div
              key={time}
              className="grid gap-3 border-t border-divider py-5 md:grid-cols-[72px_minmax(0,1fr)_220px] md:items-center md:gap-6 md:py-6"
            >
              <div className="space-y-2">
                <div className="skeleton h-3.5 w-10 rounded-sm" />
                <div className="skeleton h-3 w-14 rounded-sm" />
              </div>
              <div className="space-y-2">
                <div className="skeleton h-5 w-full max-w-[560px] rounded-sm" />
                <div className="skeleton h-5 w-4/5 max-w-[440px] rounded-sm" />
              </div>
              <div className="space-y-2 md:flex md:flex-col md:items-end">
                <div className="skeleton h-3.5 w-24 rounded-sm" />
                <div className="skeleton h-3 w-36 rounded-sm" />
              </div>
              {index === 3 ? <span className="sr-only">Karar gereken örnek kayıt</span> : null}
            </div>
          ))}

          <div className="grid border-y border-divider md:grid-cols-2 md:divide-x md:divide-divider">
            <div className="space-y-2 py-5 md:pr-8">
              <div className="skeleton h-3.5 w-28 rounded-sm" />
              <div className="skeleton h-6 w-36 rounded-sm" />
              <div className="skeleton h-4 w-full max-w-[420px] rounded-sm" />
            </div>
            <div className="space-y-2 border-t border-divider py-5 md:border-t-0 md:pl-8">
              <div className="skeleton h-3.5 w-32 rounded-sm" />
              <div className="skeleton h-6 w-32 rounded-sm" />
              <div className="skeleton h-4 w-full max-w-[420px] rounded-sm" />
            </div>
          </div>
        </div>

        <div aria-hidden="true" className="mt-8 flex flex-col items-start gap-3">
          <div className="flex flex-wrap gap-3">
            <div className="skeleton h-12 w-40 rounded-control" />
            <div className="skeleton h-12 w-52 rounded-control" />
          </div>
          <div className="skeleton h-3.5 w-48 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
