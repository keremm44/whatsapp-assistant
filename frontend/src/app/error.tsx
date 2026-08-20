"use client";

import { useEffect } from "react";

/**
 * Root error boundary. Surfaces a calm, human message — no scary stack
 * traces, no fake urgency, no aggressive CTAs.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="marketing-theme marketing-field flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center text-foreground">
      <h1 className="font-heading text-2xl text-foreground">
        Bir şeyler ters gitti
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Sayfa yüklenirken beklenmeyen bir hata oluştu. Sayfayı yenilemeyi
        deneyebilirsiniz.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Yeniden dene
      </button>
    </div>
  );
}
