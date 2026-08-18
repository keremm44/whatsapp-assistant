import { LoadingSignal } from "@/components/shared/loading-signal";

/** Root streaming state: branded signal + quiet content silhouette. */
export default function Loading() {
  return (
    <div className="seller-theme flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-foreground">
      <LoadingSignal label="Çalışma alanı hazırlanıyor" />
      <div aria-hidden="true" className="w-full max-w-[320px] space-y-3">
        <div className="skeleton h-4 w-2/3 rounded-sm" />
        <div className="skeleton h-4 w-full rounded-sm" />
        <div className="skeleton h-4 w-5/6 rounded-sm" />
      </div>
    </div>
  );
}
