"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { navigateAfterLogout } from "@/lib/auth/post-login";
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
 *   4. On success: hard document replacement to `/giris` via
 *      `navigateAfterLogout()` (`window.location.replace`). An App
 *      Router transition immediately after the session cookies
 *      change can leave a stale seller RSC tree visible; a full
 *      document load is the same auth-boundary pattern as login.
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
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      inflightRef.current?.abort();
    };
  }, []);

  const onClick = async () => {
    // Duplicate-click guard. `isSubmitting` is the React-visible
    // state (drives `disabled`); `inflightRef.current` is a
    // synchronous ref read on the very first instruction of the
    // handler, so a fast second click that fires before React
    // re-renders with `isSubmitting === true` still no-ops. This
    // is the only way to make double execution impossible, since
    // state updates from a click handler are not committed before
    // the next event tick.
    if (isSubmitting || inflightRef.current) return;
    setErrorMessage(null);

    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);

    // Tracks whether we entered the navigation path. On success
    // the component is about to unmount and we deliberately leave
    // `isSubmitting === true` and `inflightRef.current` set so the
    // control stays disabled until the route actually changes.
    // Only the failure path resets the state machine back to
    // `idle` (so the user can retry).
    let didNavigate = false;

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
      // client has cleared its cookies. Mark the success path so
      // the finally block leaves the control disabled. The
      // component is expected to unmount on the navigation that
      // follows.
      didNavigate = true;
      navigateAfterLogout();
    } catch {
      if (controller.signal.aborted) return;
      // signOut threw (network, SDK internal error, etc.). Stay
      // put. The user is still authenticated.
      setErrorMessage(
        "Çıkış şu anda tamamlanamadı. Lütfen tekrar deneyin.",
      );
    } finally {
      if (!didNavigate) {
        // Failure path (or abort). Reset the state machine so the
        // user can click the button again. On the success path we
        // intentionally skip this so the control stays disabled
        // while the navigation is in flight.
        if (inflightRef.current === controller) {
          inflightRef.current = null;
        }
        setIsSubmitting(false);
      }
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
