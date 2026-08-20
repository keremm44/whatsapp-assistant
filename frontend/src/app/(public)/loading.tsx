import { LoadingSignal } from "@/components/shared/loading-signal";

/** Public fallback shaped like the document opening. */
export default function PublicLoading() {
  return (
    <div className="bg-canvas text-foreground">
      <div className="mx-auto w-full max-w-[720px] px-5 pb-12 pt-16 md:pt-24">
        <LoadingSignal label="Sayfa hazırlanıyor" />
        <div aria-hidden="true" className="mt-6 space-y-3">
          <div className="skeleton h-10 w-full rounded-sm" />
          <div className="skeleton h-10 w-5/6 rounded-sm" />
          <div className="skeleton mt-4 h-5 w-full rounded-sm" />
          <div className="skeleton h-5 w-4/5 rounded-sm" />
        </div>
        <div aria-hidden="true" className="mt-10 border-y border-divider py-6">
          <div className="skeleton h-4 w-24 rounded-sm" />
          <div className="skeleton mt-4 h-5 w-3/4 rounded-sm" />
          <div className="skeleton mt-3 h-5 w-2/3 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
