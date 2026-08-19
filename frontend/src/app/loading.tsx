import { LoadingSignal } from "@/components/shared/loading-signal";

/** Generic app fallback. Route groups own their product-specific loading. */
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-foreground">
      <LoadingSignal label="Sayfa hazırlanıyor" />
      <div aria-hidden="true" className="w-full max-w-[320px] space-y-3">
        <div className="skeleton h-4 w-2/3 rounded-sm" />
        <div className="skeleton h-4 w-full rounded-sm" />
        <div className="skeleton h-4 w-5/6 rounded-sm" />
      </div>
    </div>
  );
}
