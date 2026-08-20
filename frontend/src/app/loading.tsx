import { LoadingSignal } from "@/components/shared/loading-signal";

/**
 * Global transition fallback. It owns the first paint before a nested route
 * layout can mount, so it must carry the same dark Instrument field as the
 * seller workspace — otherwise navigation briefly flashes the light root
 * palette before "Çalışma alanı hazırlanıyor" appears.
 */
export default function Loading() {
  return (
    <div className="marketing-theme marketing-field flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-6 text-foreground">
      <LoadingSignal label="Çalışma alanı hazırlanıyor" />
      <div aria-hidden="true" className="w-full max-w-[320px] space-y-3">
        <div className="skeleton h-4 w-2/3 rounded-sm" />
        <div className="skeleton h-4 w-full rounded-sm" />
        <div className="skeleton h-4 w-5/6 rounded-sm" />
      </div>
    </div>
  );
}
