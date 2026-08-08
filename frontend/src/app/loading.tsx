/**
 * Root loading UI. Rendered while route segments stream in.
 * Kept minimal and calm — no spinners with brand-inconsistent motion.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50vh] items-center justify-center"
    >
      <span className="text-sm text-muted-foreground">Yükleniyor…</span>
    </div>
  );
}
