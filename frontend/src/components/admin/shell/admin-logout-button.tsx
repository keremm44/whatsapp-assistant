"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Logout control for the admin panel (Client Component).
 *
 * This control is identical in behavior to the seller settings
 * logout button. The pattern below MUST be kept in sync:
 *
 *   - synchronous duplicate-click guard via `inFlightRef.current`
 *   - failure paths reset `isSubmitting` and the inflight ref
 *   - success path leaves both set, navigates to /giris, and
 *     lets the component unmount
 *
 * Do not refactor this component to share code with the seller
 * logout — the two control surfaces may diverge later (admin
 * logout from the topbar, seller logout from a settings page)
 * and the explicit duplication makes the state machine obvious
 * at each call site.
 *
 * The component never:
 *   - clears cookies manually
 *   - manipulates localStorage / sessionStorage
 *   - calls any backend logout endpoint
 *   - shows a confirmation modal
 *   - redirects to anywhere other than /giris
 */
export function AdminLogoutButton({
  variant = "ghost",
  size = "sm",
  className,
}: {
  /**
   * Visual variant. Defaults to a quiet "ghost" button so the
   * control reads as a session action, not a primary CTA. The
   * `link` variant is also available for inline use.
   */
  variant?: "ghost" | "link" | "secondary";
  size?: "sm" | "md";
  className?: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      inflightRef.current?.abort();
    };
  }, []);

  const onClick = async () => {
    // Synchronous duplicate-click guard. Reading the ref first
    // means a fast second click in the same event tick cannot
    // slip past the React-state-based `isSubmitting` check.
    if (isSubmitting || inflightRef.current) return;
    setErrorMessage(null);

    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);

    // Tracks whether we entered the navigation path. The
    // finally block MUST NOT reset state on the success path
    // — see the seller logout comment for the rationale.
    let didNavigate = false;

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut();

      if (controller.signal.aborted) return;

      if (error) {
        setErrorMessage(
          "Çıkış şu anda tamamlanamadı. Lütfen tekrar deneyin.",
        );
        return;
      }

      didNavigate = true;
      router.replace("/giris");
      router.refresh();
    } catch {
      if (controller.signal.aborted) return;
      setErrorMessage(
        "Çıkış şu anda tamamlanamadı. Lütfen tekrar deneyin.",
      );
    } finally {
      if (!didNavigate) {
        if (inflightRef.current === controller) {
          inflightRef.current = null;
        }
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={onClick}
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        className={className}
      >
        {isSubmitting ? (
          <span className="inline-flex items-center gap-2">
            <Spinner size={14} label="Çıkış yapılıyor" />
            <span>Çıkış yapılıyor…</span>
          </span>
        ) : (
          "Çıkış yap"
        )}
      </Button>
      {errorMessage ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-destructive/30 bg-destructive-muted px-2.5 py-1 text-xs text-destructive"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
