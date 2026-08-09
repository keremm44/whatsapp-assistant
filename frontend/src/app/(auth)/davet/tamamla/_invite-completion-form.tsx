"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import { fetchAuthMe } from "@/lib/auth/me";
import { completeInvite } from "@/lib/auth/invite";
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
 *     - Get the live Supabase session access token (we never assume
 *       updateUser() returns a fresh token; we read getSession()).
 *     - POST /auth/complete-invite with that token.
 *     - On success, GET /auth/me to confirm role=seller and status=active.
 *     - On confirmation, router.replace("/seller").
 *
 * Edge case — Stage 1 succeeded, Stage 2 transiently failed:
 *   The component tracks an internal "activation_retry" state. While in
 *   that state, the password form is hidden and a "Tekrar dene" button
 *   retries only Stage 2 (completeInvite + /auth/me). The password is
 *   NEVER sent a second time, because it is already saved in Supabase.
 *
 * Edge case — Stage 2 returned 401/403/404/409 (permanent):
 *   The component shows a permanent-invite failure state and (for 401)
 *   signs the Supabase session out. The user is told to contact their
 *   admin for a new invite. The form does not re-show the password.
 */

const MIN_PASSWORD_LENGTH = 8;

type SubmitStage = "password_form" | "activating" | "activation_retry";

const FRIENDLY_TRANSIENT =
  "Hesabınızın son adımı şu anda tamamlanamadı. Tekrar deneyebilirsiniz.";

const PERMANENT_INVITE_MESSAGES = {
  expired: "Bu davet bağlantısı artık geçerli görünmüyor.",
  mismatch:
    "Bu davet hesabınızla eşleştirilemedi.",
  not_completable:
    "Bu davet artık tamamlanabilir durumda görünmüyor.",
} as const;

type PermanentInviteKind = keyof typeof PERMANENT_INVITE_MESSAGES;

const classifyCompleteInviteError = (error: unknown): {
  category: "permanent" | "transient";
  kind: PermanentInviteKind | null;
} => {
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
      return { category: "transient", kind: null };
    }
  }
  // Network / parse / unknown. Treat as transient.
  return { category: "transient", kind: null };
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
   * Run Stage 1: supabase.auth.updateUser({ password }).
   * On success, returns the freshly-resolved access token. Returns
   * null on any failure or abort.
   */
  const runPasswordUpdate = async (
    controller: AbortController,
  ): Promise<string | null> => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.updateUser({ password });

    if (controller.signal.aborted) return null;

    if (error || !data.user) {
      // Password update failure (Supabase server-side validation,
      // network, etc). Keep the user on the form. No signOut.
      setPasswordError(
        "Şifre güncellenemedi. Lütfen tekrar deneyin veya farklı bir şifre deneyin.",
      );
      return null;
    }

    // updateUser may not return a new access token. Resolve the
    // current session explicitly so we have a known-good token for
    // the backend call.
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (controller.signal.aborted) return null;
    if (sessionError || !sessionData.session) {
      setPasswordError(
        "Oturum doğrulanamadı. Lütfen sayfayı yenileyip tekrar deneyin.",
      );
      return null;
    }

    const token = sessionData.session.access_token;
    if (!token) {
      setPasswordError(
        "Oturum doğrulanamadı. Lütfen sayfayı yenileyip tekrar deneyin.",
      );
      return null;
    }
    return token;
  };

  /**
   * Run Stage 2: completeInvite + fetchAuthMe.
   * Returns true on success (role=seller verified). On transient
   * failure, returns false and stays in activation_retry. On
   * permanent failure, returns false and the caller will switch
   * to the permanent-invite view.
   */
  const runActivation = async (
    controller: AbortController,
    accessToken: string,
  ): Promise<{ ok: true } | { ok: false; permanent: boolean }> => {
    try {
      await completeInvite(accessToken, { signal: controller.signal });
      if (controller.signal.aborted) return { ok: false, permanent: false };

      const me = await fetchAuthMe(accessToken, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return { ok: false, permanent: false };

      if (me.role !== "seller" || me.status !== "active") {
        // Backend accepted completion but final identity is not a
        // seller-active account. Treat as permanent business-state
        // failure; do not loop.
        return { ok: false, permanent: true };
      }
      return { ok: true };
    } catch (error) {
      if (controller.signal.aborted) return { ok: false, permanent: false };

      // Distinguish `/auth/me` transient failure after a successful
      // completion from a completion error. We can't perfectly
      // separate them here because both end up in this catch, but
      // the policy is: a transient anywhere in the chain is a
      // transient; a permanent 401/404/409 in completeInvite is
      // permanent. /auth/me never returns 4xx for a "permanent"
      // case the user can fix — at worst it returns 5xx.
      if (error instanceof ApiError && (error.status === 401 || error.status === 404 || error.status === 409)) {
        return { ok: false, permanent: true };
      }
      return { ok: false, permanent: false };
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setActivationError(null);

    if (!validatePasswords()) return;

    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);

    const supabase = createSupabaseBrowserClient();

    const token = await runPasswordUpdate(controller);
    if (controller.signal.aborted) return;
    if (!token) {
      // Password update failed; the user stays on the form.
      setIsSubmitting(false);
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      return;
    }

    setStage("activating");

    const result = await runActivation(controller, token);
    if (controller.signal.aborted) return;

    if (result.ok) {
      router.replace("/seller");
      return;
    }

    if (result.permanent) {
      // 401 here is "the invite session is no longer valid". Clean
      // up the Supabase session so the user cannot re-enter the
      // flow against a stale session. We do this only on permanent
      // authorization rejection, not on transient failures.
      try {
        await supabase.auth.signOut();
      } catch {
        // signOut errors are not user-visible.
      }
      setPermanentMessage(
        PERMANENT_INVITE_MESSAGES.not_completable,
      );
      setStage("password_form");
    } else {
      setActivationError(FRIENDLY_TRANSIENT);
      setStage("activation_retry");
    }

    setIsSubmitting(false);
    if (inflightRef.current === controller) {
      inflightRef.current = null;
    }
  };

  const retry = async () => {
    if (isSubmitting) return;
    setActivationError(null);
    setPermanentMessage(null);

    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);
    setStage("activating");

    const supabase = createSupabaseBrowserClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (controller.signal.aborted) return;
    if (sessionError || !sessionData.session) {
      setPermanentMessage(PERMANENT_INVITE_MESSAGES.expired);
      try {
        await supabase.auth.signOut();
      } catch {
        // signOut errors are not user-visible.
      }
      setStage("password_form");
      setIsSubmitting(false);
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      return;
    }
    const token = sessionData.session.access_token;
    if (!token) {
      setPermanentMessage(PERMANENT_INVITE_MESSAGES.expired);
      try {
        await supabase.auth.signOut();
      } catch {
        // signOut errors are not user-visible.
      }
      setStage("password_form");
      setIsSubmitting(false);
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      return;
    }

    const result = await runActivation(controller, token);
    if (controller.signal.aborted) return;

    if (result.ok) {
      router.replace("/seller");
      return;
    }
    if (result.permanent) {
      try {
        await supabase.auth.signOut();
      } catch {
        // signOut errors are not user-visible.
      }
      setPermanentMessage(
        PERMANENT_INVITE_MESSAGES.not_completable,
      );
      setStage("password_form");
    } else {
      setActivationError(FRIENDLY_TRANSIENT);
      setStage("activation_retry");
    }

    setIsSubmitting(false);
    if (inflightRef.current === controller) {
      inflightRef.current = null;
    }
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

// Exported for unit-style sanity only; not part of the public API.
export const _internal = { classifyCompleteInviteError, MIN_PASSWORD_LENGTH };
