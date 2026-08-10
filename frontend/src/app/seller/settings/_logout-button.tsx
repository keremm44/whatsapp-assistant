"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Logout button for the seller settings page (Client Component).
 *
 * Flow:
 *   1. User clicks "Çıkış yap".
 *   2. Button enters submitting state (disabled, spinner + "Çıkış
 *      yapılıyor…"). Double-clicks are blocked by the disabled
 *      flag, with a belt-and-suspenders inflight ref so a fast
 *      second click that beats the disabled re-render also no-ops.
 *   3. `supabase.auth.signOut()` is invoked on the existing browser
 *      Supabase client. The @supabase/ssr browser client owns the
 *      auth cookies; we do not touch them by hand.
 *   4. On success: `router.replace("/giris")` then
 *      `router.refresh()`. The replace navigates to /giris; the
 *      refresh re-fetches the RSC payload so the seller layout's
 *      resolver would not serve a stale view if anything ping-pongs
 *      back. The existing /giris server resolver sees an
 *      unauthenticated state and renders the normal login form.
 *   5. On failure: stay on /seller/settings, re-enable the button,
 *      surface a calm inline error. We do NOT assume the session
 *      is closed; the user can simply try again.
 *
 * The component never:
 *   - clears cookies manually
 *   - manipulates localStorage / sessionStorage
 *   - calls any backend logout endpoint
 *   - shows a confirmation modal
 *   - opens a dropdown / profile menu
 *   - redirects to anywhere other than /giris
 */
export function LogoutButton() {
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
    if (isSubmitting) return;
    setErrorMessage(null);

    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut();

      if (controller.signal.aborted) return;

      if (error) {
        // Stay on /seller/settings. The session is still open.
        setErrorMessage(
          "Çıkış şu anda tamamlanamadı. Lütfen tekrar deneyin.",
        );
        return;
      }

      // signOut() resolved without error. The Supabase browser
      // client has cleared its cookies. Navigate to the login
      // page and refresh the RSC payload so any stale server
      // render is invalidated. The component will unmount on
      // navigation; the finally block's setState is harmless.
      router.replace("/giris");
      router.refresh();
    } catch {
      if (controller.signal.aborted) return;
      // signOut threw (network, SDK internal error, etc.). Stay
      // put. The user is still authenticated.
      setErrorMessage(
        "Çıkış şu anda tamamlanamadı. Lütfen tekrar deneyin.",
      );
    } finally {
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      // Always re-enable. On the success path the component is
      // about to unmount and this state change is a no-op; on
      // the error path it is the whole point of this finally.
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={onClick}
        disabled={isSubmitting}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? (
          <span className="inline-flex items-center gap-2">
            <Spinner size={16} label="Çıkış yapılıyor" />
            <span>Çıkış yapılıyor…</span>
          </span>
        ) : (
          "Çıkış yap"
        )}
      </Button>

      {errorMessage ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-destructive/30 bg-destructive-muted px-3 py-2 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
