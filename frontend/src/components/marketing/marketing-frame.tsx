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

/** Site-wide instrument field: faint grid + one cool well. Not empty, not busy. */
export function FieldGrain() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div className="absolute -left-1/4 top-[-10%] h-[40vh] w-[55vw] rounded-full bg-primary/[0.03] blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(var(--color-boundary-rgb) / 0.7) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--color-boundary-rgb) / 0.7) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          maskImage:
            "radial-gradient(ellipse at 50% 0%, black 10%, transparent 70%)",
        }}
      />
    </div>
  );
}
