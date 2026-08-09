"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import { completeInvite } from "@/lib/auth/invite";
import { fetchAuthMe } from "@/lib/auth/me";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

/**
 * Invite completion form.
 *
 * Two-stage orchestration, with a hard one-way boundary after Stage 1:
 *
 *   Stage 1: Password creation
 *     - Validate locally (length >= 8, match).
 *     - supabase.auth.updateUser({ password }).
 *     - The result has two observable outcomes:
 *         (a) updateUser errored -> password NOT saved -> stay on the
 *             password form with an inline error.
 *         (b) updateUser succeeded -> password IS saved -> the form
 *             must NEVER call updateUser again. The component tracks
 *             this with a one-way `passwordSaved` flag.
 *     - The token resolution is decoupled from the password update
 *       success: a missing token after a successful update is NOT
 *       treated as a password update failure. It is handled in Stage 2
 *       (transient retry if the session recovers, permanent failure
 *       if the session is truly gone).
 *
 *   Stage 2: Backend activation
 *     - Resolve the current Supabase session access token.
 *     - POST /auth/complete-invite with that token.
 *       Errors are classified distinctly:
 *           401 -> permanent expired
 *           404 -> permanent mismatch
 *           409 -> permanent not_completable
 *           5xx / network -> transient
 *     - On complete-invite success, GET /auth/me to confirm the final
 *       application identity.
 *       Errors are classified as:
 *           401 / 403 / 404 (Http) -> permanent application access
 *           5xx / network           -> transient
 *           parsed contract error   -> permanent application access
 *             (the backend returned a 2xx response but the shape
 *              violated the agreed contract; this is not a transient
 *              failure and must not be retried)
 *     - On confirmation, verify the final shape
 *       (role === "seller" && status === "active" && sellerId !== null)
 *       before navigating to /seller.
 *
 * The two backend operations live in their own try/catch blocks so
 * each one reports its own status to the UI, instead of collapsing
 * every error into a single permanent/transient flag.
 *
 * Edge case — Stage 1 succeeded, Stage 2 transiently failed:
 *   The component transitions to an internal "activation_retry" state.
 *   While in that state, the password form is hidden and a "Tekrar
 *   dene" button retries only Stage 2 (complete-invite + /auth/me).
 *   The password is NEVER sent a second time, because it is already
 *   saved in Supabase. The "password saved" notice stays visible.
 *
 * Session policy:
 *   - On transient failures (network / 5xx), the Supabase session is
 *     preserved so the seller can retry.
 *   - On permanent failures (401 / 404 / 409 / contract violation),
 *     the Supabase session is torn down so the seller does not
 *     re-enter the flow against a stale session.
 *   - The "password saved" boundary is one-way: once Stage 1 succeeds,
 *     the password form is permanently gone from this view and
 *     `updateUser({ password })` is never called again.
 */

const MIN_PASSWORD_LENGTH = 8;

type SubmitStage = "password_form" | "activating" | "activation_retry";

/**
 * One-way boolean: true once `supabase.auth.updateUser({ password })`
 * has returned successfully. The form is rendered only while this is
 * false. The form MUST never call updateUser a second time.
 */
type PasswordSaved = boolean;

const FRIENDLY_TRANSIENT =
  "Hesabınızın son adımı şu anda tamamlanamadı. Tekrar deneyebilirsiniz.";

const PERMANENT_INVITE_MESSAGES = {
  expired: "Bu davet bağlantısı artık geçerli görünmüyor.",
  mismatch: "Bu davet hesabınızla eşleştirilemedi.",
  not_completable: "Bu davet artık tamamlanabilir durumda görünmüyor.",
  application_access: "Bu hesap henüz kullanıma hazır değil.",
} as const;

type PermanentInviteKind = keyof typeof PERMANENT_INVITE_MESSAGES;

type CompleteInviteClassification =
  | {
      category: "permanent";
      kind: Exclude<PermanentInviteKind, "application_access">;
    }
  | { category: "transient" };

type AuthMeClassification =
  | { category: "permanent"; kind: "application_access" }
  | { category: "transient" };

/**
 * Classify a complete-invite error.
 *   401 -> permanent expired
 *   404 -> permanent mismatch
 *   409 -> permanent not_completable
 *   5xx -> transient
 *   network / parse / unknown -> transient
 */
const classifyCompleteInviteError = (
  error: unknown,
): CompleteInviteClassification => {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return { category: "permanent", kind: "expired" };
    }
    if (error.status === 404) {
      return { category: "permanent", kind: "mismatch" };
    }
    if (error.status === 409) {
      return { category: "permanent", kind: "not_completable" };
    }
    if (error.status >= 500) {
      return { category: "transient" };
    }
  }
  return { category: "transient" };
};

/**
 * Classify an /auth/me error after a successful complete-invite.
 *   Http 401 / 403 / 404         -> permanent application access
 *   Http 5xx                     -> transient
 *   network / fetch failure      -> transient
 *   parsed contract violation     -> permanent application access
 *     (the backend returned a 2xx but the shape did not match the
 *      agreed /auth/me contract — this is not transient and must not
 *      be retried in a loop).
 */
const classifyAuthMeError = (error: unknown): AuthMeClassification => {
  if (error instanceof ApiError) {
    if (
      error.status === 401 ||
      error.status === 403 ||
      error.status === 404
    ) {
      return { category: "permanent", kind: "application_access" };
    }
    if (error.status >= 500) {
      return { category: "transient" };
    }
  }
  if (isAuthMeContractError(error)) {
    return { category: "permanent", kind: "application_access" };
  }
  return { category: "transient" };
};

/**
 * Detect the parser-level contract errors raised by `lib/auth/me.ts`.
 * These are NOT network failures: the HTTP request completed and the
 * backend returned a 2xx response, but the body did not match the
 * agreed /auth/me contract. They must never drive a transient retry
 * loop.
 */
const isAuthMeContractError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return false;
  return message.startsWith("auth_me_invalid_");
};

/**
 * Heuristic network / fetch error detection, mirroring the rule
 * used elsewhere in the auth flow. Kept local so this module does
 * not depend on lib/auth/errors.ts internals.
 */
const isFetchNetworkError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  if ((error as { name?: unknown }).name === "AbortError") return false;
  if (error instanceof TypeError) {
    return /fetch|network|connection/i.test(error.message);
  }
  if (error instanceof ApiError) {
    return error.status === 0;
  }
  return false;
};

export function InviteCompletionForm({
  invitedEmail,
}: {
  invitedEmail: string;
}) {
  const router = useRouter();
  const [stage, setStage] = React.useState<SubmitStage>("password_form");
  /**
   * One-way switch. Flips to true the moment updateUser returns
   * without error. While true:
   *   - the password form is not rendered,
   *   - the retry path will not call updateUser again,
   *   - the activation_retry state shows the "password saved" notice.
   * The flag is NEVER reset to false during the component's lifetime.
   */
  const [passwordSaved, setPasswordSaved] =
    React.useState<PasswordSaved>(false);
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  const [activationError, setActivationError] = React.useState<string | null>(
    null,
  );
  const [permanentMessage, setPermanentMessage] = React.useState<string | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      inflightRef.current?.abort();
    };
  }, []);

  const validatePasswords = (): boolean => {
    let ok = true;
    setPasswordError(null);
    setConfirmError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(
        `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`,
      );
      ok = false;
    }

    if (confirmPassword.length === 0) {
      setConfirmError("Şifre tekrarı zorunludur.");
      ok = false;
    } else if (password !== confirmPassword) {
      setConfirmError("Şifreler eşleşmiyor.");
      ok = false;
    }

    return ok;
  };

  const resolveAccessToken = async (): Promise<string | null> => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    return data.session.access_token ?? null;
  };

  const signOutQuietly = async () => {
    const supabase = createSupabaseBrowserClient();
    try {
      await supabase.auth.signOut();
    } catch {
      // signOut errors are not user-visible.
    }
  };

  /**
   * Run Stage 1: supabase.auth.updateUser({ password }).
   * Returns:
   *   { saved: true }  -> updateUser succeeded. Password is in
   *                       Supabase. Do NOT call updateUser again.
   *   { saved: false } -> updateUser errored OR was aborted. Password
   *                       is NOT in Supabase. The caller keeps the
   *                       user on the password form.
   */
  const runPasswordUpdate = async (
    controller: AbortController,
  ): Promise<{ saved: boolean }> => {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (controller.signal.aborted) return { saved: false };

    if (error) {
      setPasswordError(
        "Şifre güncellenemedi. Lütfen tekrar deneyin veya farklı bir şifre deneyin.",
      );
      return { saved: false };
    }

    return { saved: true };
  };

  /**
   * Run Stage 2 step A: complete-invite.
   *   { ok: true }
   *   { ok: false; transient: true }                            -> 5xx / network
   *   { ok: false; transient: false; permanent: <kind> }        -> 401/404/409
   * 401/404/409 also tear down the Supabase session. Transients
   * preserve the session.
   */
  const runCompleteInvite = async (
    controller: AbortController,
    accessToken: string,
  ): Promise<
    | { ok: true }
    | { ok: false; transient: true }
    | { ok: false; transient: false; permanent: PermanentInviteKind }
  > => {
    try {
      await completeInvite(accessToken, { signal: controller.signal });
      return { ok: true };
    } catch (error) {
      if (controller.signal.aborted) return { ok: false, transient: true };
      if (isFetchNetworkError(error)) {
        return { ok: false, transient: true };
      }
      const classified = classifyCompleteInviteError(error);
      if (classified.category === "permanent") {
        await signOutQuietly();
        return {
          ok: false,
          transient: false,
          permanent: classified.kind,
        };
      }
      return { ok: false, transient: true };
    }
  };

  /**
   * Run Stage 2 step B: /auth/me final identity check.
   *   { ok: true }
   *   { ok: false; transient: true }
   *   { ok: false; transient: false; permanent: <kind> }
   * The permanent branch covers:
   *   - Http 401 / 403 / 404
   *   - parsed contract violation (auth_me_invalid_*) from
   *     lib/auth/me.ts. The backend returned a 2xx but the body did
   *     not match the agreed /auth/me contract. This is not a
   *     transient failure and must not be retried in a loop.
   *   - final identity check failure
   *     (role !== "seller" || status !== "active" || sellerId === null)
   */
  const runFinalIdentityCheck = async (
    controller: AbortController,
    accessToken: string,
  ): Promise<
    | { ok: true }
    | { ok: false; transient: true }
    | { ok: false; transient: false; permanent: PermanentInviteKind }
  > => {
    let me;
    try {
      me = await fetchAuthMe(accessToken, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) return { ok: false, transient: true };
      if (isFetchNetworkError(error)) {
        return { ok: false, transient: true };
      }
      const classified = classifyAuthMeError(error);
      if (classified.category === "permanent") {
        await signOutQuietly();
        return {
          ok: false,
          transient: false,
          permanent: "application_access",
        };
      }
      return { ok: false, transient: true };
    }
    if (controller.signal.aborted) return { ok: false, transient: true };

    if (
      me.role !== "seller" ||
      me.status !== "active" ||
      me.sellerId === null
    ) {
      await signOutQuietly();
      return {
        ok: false,
        transient: false,
        permanent: "application_access",
      };
    }
    return { ok: true };
  };

  const goToPermanentInviteFailure = (kind: PermanentInviteKind) => {
    setPermanentMessage(PERMANENT_INVITE_MESSAGES[kind]);
    // If the password is already saved we keep the activation_retry
    // shell (no password form) but with the permanent message rendered.
    // If the password is NOT yet saved, we can fall back to the
    // password form. This branch only triggers before passwordSaved
    // in practice (the submit path); it remains correct in both.
    setStage("activation_retry");
  };

  const goToTransientRetry = () => {
    setActivationError(FRIENDLY_TRANSIENT);
    setStage("activation_retry");
  };

  /**
   * Begin Stage 2 given a saved password. Tries to resolve the access
   * token and run the activation chain. If the token is missing but
   * the session is recoverable, the caller stays in activation_retry
   * (a "Tekrar dene" will re-resolve the token on the next click). If
   * the session is truly gone, we treat it as a permanent expired
   * failure.
   */
  const runStage2 = async (
    controller: AbortController,
  ): Promise<void> => {
    const token = await resolveAccessToken();
    if (controller.signal.aborted) return;

    if (!token) {
      // No session at all -> the invite has expired. Permanent.
      await signOutQuietly();
      goToPermanentInviteFailure("expired");
      return;
    }

    const invite = await runCompleteInvite(controller, token);
    if (controller.signal.aborted) return;

    if (!invite.ok) {
      if (invite.transient) {
        goToTransientRetry();
      } else {
        goToPermanentInviteFailure(invite.permanent);
      }
      return;
    }

    const identity = await runFinalIdentityCheck(controller, token);
    if (controller.signal.aborted) return;

    if (!identity.ok) {
      if (identity.transient) {
        goToTransientRetry();
      } else {
        goToPermanentInviteFailure(identity.permanent);
      }
      return;
    }

    router.replace("/seller");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (passwordSaved) {
      // Defense in depth: if the password is already saved, the
      // password form should not even be rendered, but a stray
      // submit (e.g. enter key) is treated as a no-op.
      return;
    }
    setActivationError(null);

    if (!validatePasswords()) return;

    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);

    const result = await runPasswordUpdate(controller);
    if (controller.signal.aborted) return;

    if (!result.saved) {
      // Password update failed; the user stays on the form. The
      // password form MUST remain rendered.
      setIsSubmitting(false);
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      return;
    }

    // Password is now saved in Supabase. Lock the password form away
    // and never call updateUser again from any path.
    setPasswordSaved(true);
    setStage("activating");

    await runStage2(controller);

    if (!controller.signal.aborted) {
      setIsSubmitting(false);
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
    }
  };

  const retry = async () => {
    if (isSubmitting) return;
    if (!passwordSaved) {
      // A retry only makes sense after the password is saved. The UI
      // never shows the retry button in the password_form state, but
      // we guard here as well.
      return;
    }
    setActivationError(null);
    setPermanentMessage(null);

    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);
    setStage("activating");

    await runStage2(controller);

    if (!controller.signal.aborted) {
      setIsSubmitting(false);
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
    }
  };

  // Permanent failure has the highest visual priority: it does NOT
  // render the password form (it cannot be reset), it does NOT show
  // a retry button, and the user is told to request a new invite.
  if (permanentMessage) {
    return (
      <div
        role="alert"
        aria-live="polite"
        className="rounded-md border border-destructive/30 bg-destructive-muted px-3 py-3 text-sm text-destructive"
      >
        <p>{permanentMessage}</p>
        <p className="mt-1 text-muted-foreground">
          Yeni bir davet için yöneticinizle iletişime geçebilirsiniz.
        </p>
      </div>
    );
  }

  // Password is saved -> the password form is gone. The user sees
  // either a transient retry affordance or the activating state.
  if (passwordSaved) {
    if (stage === "activation_retry") {
      return (
        <div className="space-y-4">
          <div
            role="alert"
            aria-live="polite"
            className="rounded-md border border-warning/30 bg-warning-muted px-3 py-3 text-sm text-foreground"
          >
            <p className="font-medium text-foreground">Şifreniz kaydedildi.</p>
            <p className="mt-1 text-muted-foreground">
              {activationError ?? FRIENDLY_TRANSIENT}
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full"
            onClick={retry}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size={16} label="Tekrar deneniyor" />
                <span>Hesap hazırlanıyor…</span>
              </span>
            ) : (
              "Tekrar dene"
            )}
          </Button>
        </div>
      );
    }

    // passwordSaved && stage === "activating"
    return (
      <div
        className="space-y-4"
        role="status"
        aria-busy={isSubmitting}
        aria-live="polite"
      >
        <p className="text-sm font-medium text-foreground">
          Şifreniz kaydedildi.
        </p>
        <p className="text-sm text-muted-foreground">
          Hesabınızın son adımı tamamlanıyor.
        </p>
        <Button type="button" variant="primary" size="lg" className="w-full" disabled>
          <span className="inline-flex items-center gap-2">
            <Spinner size={16} label="Hesap hazırlanıyor" />
            <span>Hesap hazırlanıyor…</span>
          </span>
        </Button>
      </div>
    );
  }

  // passwordSaved === false -> the password form is rendered.
  return (
    <form onSubmit={submit} noValidate aria-busy={isSubmitting} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">E-posta</Label>
        <div
          id="invite-email"
          className="flex h-10 w-full items-center rounded-md border border-border bg-surface-2 px-3 text-sm text-foreground"
          aria-readonly="true"
        >
          {invitedEmail}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-password">Yeni şifre</Label>
        <div className="relative">
          <Input
            id="invite-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            disabled={isSubmitting}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (passwordError) setPasswordError(null);
            }}
            aria-invalid={passwordError ? "true" : undefined}
            aria-describedby={
              passwordError
                ? "invite-password-error"
                : "invite-password-hint"
            }
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={isSubmitting}
            aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
            aria-pressed={showPassword}
            className={cn(
              "absolute inset-y-0 right-0 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {showPassword ? (
              <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Eye size={18} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        </div>
        {passwordError ? (
          <p
            id="invite-password-error"
            className="text-xs text-destructive"
          >
            {passwordError}
          </p>
        ) : (
          <p
            id="invite-password-hint"
            className="text-xs text-muted-foreground"
          >
            En az {MIN_PASSWORD_LENGTH} karakter kullanın.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-password-confirm">Şifre tekrar</Label>
        <div className="relative">
          <Input
            id="invite-password-confirm"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            required
            disabled={isSubmitting}
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              if (confirmError) setConfirmError(null);
            }}
            aria-invalid={confirmError ? "true" : undefined}
            aria-describedby={
              confirmError ? "invite-password-confirm-error" : undefined
            }
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            disabled={isSubmitting}
            aria-label={
              showConfirm ? "Şifre tekrarı gizle" : "Şifre tekrarı göster"
            }
            aria-pressed={showConfirm}
            className={cn(
              "absolute inset-y-0 right-0 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {showConfirm ? (
              <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Eye size={18} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        </div>
        {confirmError ? (
          <p
            id="invite-password-confirm-error"
            className="text-xs text-destructive"
          >
            {confirmError}
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <span className="inline-flex items-center gap-2">
            <Spinner size={16} label="Hesap hazırlanıyor" />
            <span>Hesap hazırlanıyor…</span>
          </span>
        ) : (
          "Hesabımı oluştur"
        )}
      </Button>
    </form>
  );
}
