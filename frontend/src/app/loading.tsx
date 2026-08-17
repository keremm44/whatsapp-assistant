/**
 * Root loading UI. Rendered while route segments stream in.
 *
 * Calm skeleton blocks (quiet shimmer, neutral material) rather than a
 * bare label — the geometry reads as "content is arriving" without a
 * brand-inconsistent spinner. Reduced-motion users get the static
 * blocks with the shimmer disabled by the global override.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4"
    >
      <span className="sr-only">Yükleniyor…</span>
      <div className="w-full max-w-[320px] space-y-3">
        <div className="skeleton h-4 w-2/3 rounded-sm" />
        <div className="skeleton h-4 w-full rounded-sm" />
        <div className="skeleton h-4 w-5/6 rounded-sm" />
      </div>
    </div>
  );
}
