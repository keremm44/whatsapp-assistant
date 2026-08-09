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
 * Two-stage orchestration:
 *
 *   Stage 1: Password creation
 *     - Validate locally (length >= 8, match).
 *     - supabase.auth.updateUser({ password }).
 *     - On success, move to Stage 2.
 *
 *   Stage 2: Backend activation
 *     - Read the current Supabase session access token (we never
 *       assume updateUser() returns a fresh token).
 *     - POST /auth/complete-invite with that token.
 *       Errors here are classified distinctly:
 *           401 -> permanent expired
 *           404 -> permanent mismatch
 *           409 -> permanent not_completable
 *           5xx / network -> transient
 *     - On complete-invite success, GET /auth/me to confirm the final
 *       application identity.
 *       Errors here are classified as:
 *           401 / 403 / 404 -> permanent application access failure
 *           5xx / network -> transient
 *           parsed contract violation -> permanent generic
 *     - On confirmation, verify the final shape
 *       (role === "seller" && status === "active" && sellerId !== null)
 *       before navigating to /seller.
 *
 * The two backend operations live in their own try/catch blocks so
 * each one reports its own status to the UI, instead of collapsing
 * every error into a single permanent/transient flag.
 *
 * Edge case — Stage 1 succeeded, Stage 2 transiently failed:
 *   The component tracks an internal "activation_retry" state. While
 *   in that state, the password form is hidden and a "Tekrar dene"
 *   button retries only Stage 2 (complete-invite + /auth/me). The
 *   password is NEVER sent a second time, because it is already
 *   saved in Supabase.
 *
 * Session policy:
 *   - On transient failures (network / 5xx / parse), the Supabase
 *     session is preserved so the seller can retry.
 *   - On permanent failures (401 / 404 / 409 / contract violation),
 *     the Supabase session is torn down so the seller does not
 *     re-enter the flow against a stale session.
 */

const MIN_PASSWORD_LENGTH = 8;

type SubmitStage = "password_form" | "activating" | "activation_retry";

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
  | { category: "permanent"; kind: Exclude<PermanentInviteKind, "application_access"> }
  | { category: "transient" };

type AuthMeClassification =
  | { category: "permanent"; kind: "application_access" | "invalid_contract" }
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
 *   401 / 403 / 404 -> permanent application access failure
 *   5xx -> transient
 *   network / parse / unknown -> transient
 *   (parsed contract violation is detected by the caller, not here.)
 */
const classifyAuthMeError = (
  error: unknown,
): AuthMeClassification => {
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
  return { category: "transient" };
};

export function InviteCompletionForm({
  invitedEmail,
}: {
  invitedEmail: string;
}) {
  const router = useRouter();
  const [stage, setStage] = React.useState<SubmitStage>("password_form");
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

  /**
   * Resolve the current Supabase session access token. Returns null
   * if the session is missing or invalid (which is itself a permanent
   * invite state, not a transient retry).
   */
  const resolveAccessToken = async (): Promise<string | null> => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    return data.session.access_token ?? null;
  };

  /**
   * Tear down the Supabase session on permanent failure so the
   * user cannot re-enter the flow against a stale session.
   * signOut errors are intentionally swallowed: the user-facing
   * message has already been resolved by the caller.
   */
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
   * On success, returns the resolved access token. Returns null on
   * any failure or abort (the user stays on the form).
   */
  const runPasswordUpdate = async (
    controller: AbortController,
  ): Promise<string | null> => {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (controller.signal.aborted) return null;

    if (error) {
      setPasswordError(
        "Şifre güncellenemedi. Lütfen tekrar deneyin veya farklı bir şifre deneyin.",
      );
      return null;
    }

    return resolveAccessToken();
  };

  /**
   * Run Stage 2 step A: complete-invite.
   * Returns one of:
   *   { ok: true }
   *   { ok: false; transient: true }   -> 5xx / network / unknown
   *   { ok: false; transient: false; permanent: <kind> }
   *     -> 401 expired, 404 mismatch, 409 not_completable
   * 401/404/409 also tear down the Supabase session (permanent
   * invite rejection). Transients preserve the session.
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
   * Returns one of:
   *   { ok: true }
   *   { ok: false; transient: true }
   *   { ok: false; transient: false; permanent: <kind> }
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
    setStage("password_form");
  };

  const goToTransientRetry = () => {
    setActivationError(FRIENDLY_TRANSIENT);
    setStage("activation_retry");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setActivationError(null);

    if (!validatePasswords()) return;

    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);

    const token = await runPasswordUpdate(controller);
    if (controller.signal.aborted) return;
    if (!token) {
      setIsSubmitting(false);
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      return;
    }

    setStage("activating");

    const invite = await runCompleteInvite(controller, token);
    if (controller.signal.aborted) return;

    if (!invite.ok) {
      if (invite.transient) {
        goToTransientRetry();
      } else {
        goToPermanentInviteFailure(invite.permanent);
      }
      setIsSubmitting(false);
      if (inflightRef.current === controller) {
        inflightRef.current = null;
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
      setIsSubmitting(false);
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      return;
    }

    router.replace("/seller");
  };

  const retry = async () => {
    if (isSubmitting) return;
    setActivationError(null);
    setPermanentMessage(null);

    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);
    setStage("activating");

    const token = await resolveAccessToken();
    if (controller.signal.aborted) return;
    if (!token) {
      // No session -> the invite has expired. Permanent, not transient.
      await signOutQuietly();
      goToPermanentInviteFailure("expired");
      setIsSubmitting(false);
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
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
      setIsSubmitting(false);
      if (inflightRef.current === controller) {
        inflightRef.current = null;
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
      setIsSubmitting(false);
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      return;
    }

    router.replace("/seller");
  };

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
