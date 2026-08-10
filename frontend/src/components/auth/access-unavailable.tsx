"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/**
 * Neutral, recoverable "we could not verify your session right now"
 * surface. Used by the seller and admin server layouts when the
 * application access resolver returns `state: "unavailable"`.
 *
 * This component does NOT redirect and does NOT sign the user out.
 * The "Tekrar dene" button re-runs the server layout, which re-runs
 * the resolver.
 *
 * The retry handler uses `React.useTransition()` so the button's
 * pending state is automatically reset when `router.refresh()`
 * completes (or when the new render finishes streaming). This means
 * a second retry attempt is always possible — if the resolver still
 * returns `unavailable` after a refresh, the button is re-enabled
 * rather than stuck in a permanent "retrying" state.
 *
 * The component lives in src/components/auth because both the seller
 * and admin layouts consume it. It is a Client Component because it
 * needs `useRouter()` to call `router.refresh()`.
 */
export function AccessUnavailable({
  className,
  contextLabel,
  compact = false,
}: {
  className?: string;
  /**
   * Short noun used in the heading so the user knows which surface
   * is unavailable. Defaults to "Panel" which fits both the seller
   * panel and the admin surface.
   */
  contextLabel?: string;
  /**
   * When true the component drops its 60vh min-height and the
   * wide vertical padding. This is for surfaces that already
   * constrain the available space (e.g. the auth card around
   * /giris). The retry UX, copy, and button behavior are
   * identical to the full-height variant.
   */
  compact?: boolean;
}) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const onRetry = () => {
    // Guard against a double-click starting two refreshes in
    // flight. The button is also disabled while either flag is
    // true.
    if (isRetrying || isPending) return;
    setIsRetrying(true);
    startTransition(() => {
      router.refresh();
    });
  };

  // When the transition settles (success or error), clear the
  // manual flag. We intentionally do NOT use `isPending` to drive
  // the button's disabled state by itself, because the transition
  // may complete before the new render decides whether the user
  // is still "unavailable" — clearing the local flag on settle
  // gives the user a clean retry even if the next render keeps
  // them in the unavailable state.
  React.useEffect(() => {
    if (!isPending) {
      setIsRetrying(false);
    }
  }, [isPending]);

  const disabled = isRetrying || isPending;

  const label = contextLabel ?? "Panel";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mx-auto flex w-full max-w-md flex-col items-center justify-center gap-3 px-4 text-center",
        compact ? "py-4" : "min-h-[60vh] py-12",
        className,
      )}
    >
      <h1 className="font-heading text-2xl font-medium leading-tight text-foreground">
        {label} şu anda açılamadı
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        Bağlantı şu anda doğrulanamadı. Tekrar deneyebilirsiniz.
      </p>
      <Button
        type="button"
        variant="primary"
        size="md"
        className="mt-2"
        onClick={onRetry}
        disabled={disabled}
      >
        Tekrar dene
      </Button>
    </div>
  );
}
