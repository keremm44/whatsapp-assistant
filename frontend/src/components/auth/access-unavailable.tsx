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
 * The component lives in src/components/auth because both the seller
 * and admin layouts consume it. It is a Client Component because it
 * needs `useRouter()` to call `router.refresh()`.
 */
export function AccessUnavailable({
  className,
  contextLabel,
}: {
  className?: string;
  /**
   * Short noun used in the heading so the user knows which surface
   * is unavailable. Defaults to "Panel" which fits both the seller
   * panel and the admin surface.
   */
  contextLabel?: string;
}) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = React.useState(false);

  const onRetry = () => {
    setIsRetrying(true);
    router.refresh();
  };

  const label = contextLabel ?? "Panel";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-3 px-4 py-12 text-center",
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
        disabled={isRetrying}
      >
        Tekrar dene
      </Button>
    </div>
  );
}
