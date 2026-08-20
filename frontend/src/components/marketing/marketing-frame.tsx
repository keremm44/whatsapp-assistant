import { cn } from "@/lib/utils/cn";

/** Quiet window chrome — product instrument, not a SaaS mockup gradient. */
export function WindowLights({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex items-center gap-1.5", className)}
    >
      <span className="h-2 w-2 rounded-full bg-chrome-foreground/25" />
      <span className="h-2 w-2 rounded-full bg-chrome-foreground/18" />
      <span className="h-2 w-2 rounded-full bg-chrome-foreground/12" />
    </span>
  );
}

export function Atmosphere({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      <div className="absolute -left-24 -top-32 h-[420px] w-[520px] rounded-full bg-primary/[0.07] blur-3xl" />
      <div className="absolute -right-16 top-24 h-[280px] w-[320px] rounded-full bg-brand/[0.06] blur-3xl" />
    </div>
  );
}
