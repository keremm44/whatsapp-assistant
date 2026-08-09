"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  classifyBackendRejection,
  classifySupabaseError,
} from "@/lib/auth/errors";
import { fetchAuthMe } from "@/lib/auth/me";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

/**
 * Login form (client component).
 *
 * Flow:
 *   1. Submit -> Supabase signInWithPassword
 *   2. On success, call GET /auth/me with the issued access token
 *   3. On backend success, redirect by role:
 *        seller -> /seller
 *        admin  -> /admin
 *   4. On backend rejection, sign the Supabase session out so the
 *      local cookie state does not remain inconsistent, and surface a
 *      calm message.
 *   5. On Supabase rejection or network error, surface a calm message
 *      without signing anything out.
 *
 * The form never navigates until the backend has authorized the
 * session. The Supabase session alone is not enough.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);

  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      inflightRef.current?.abort();
    };
  }, []);

  const validate = React.useCallback((): boolean => {
    let ok = true;
    setEmailError(null);
    setPasswordError(null);

    const trimmedEmail = email.trim();
    if (trimmedEmail.length === 0) {
      setEmailError("E-posta zorunludur.");
      ok = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError("Geçerli bir e-posta adresi girin.");
      ok = false;
    }

    if (password.length === 0) {
      setPasswordError("Şifre zorunludur.");
      ok = false;
    }

    return ok;
  }, [email, password]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);

    if (!validate()) return;

    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);

    const trimmedEmail = email.trim();

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (controller.signal.aborted) return;

      if (error || !data.session) {
        const classified = classifySupabaseError(error);
        setErrorMessage(classified.message);
        return;
      }

      const accessToken = data.session.access_token;
      if (!accessToken) {
        setErrorMessage(
          "Giriş şu anda tamamlanamadı. Lütfen tekrar deneyin.",
        );
        return;
      }

      try {
        const me = await fetchAuthMe(accessToken, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const target = me.role === "admin" ? "/admin" : "/seller";
        router.replace(target);
      } catch (backendError) {
        if (controller.signal.aborted) return;
        const classified = classifyBackendRejection(backendError);
        // Backend refused the application access. Tear down the Supabase
        // session so the browser cookie state does not stay inconsistent.
        try {
          await supabase.auth.signOut();
        } catch {
          // signOut errors are not user-visible; we already have a
          // classified message ready to display.
        }
        setErrorMessage(classified.message);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const classified = classifySupabaseError(error);
      setErrorMessage(classified.message);
    } finally {
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-busy={isSubmitting}
      className="space-y-5"
    >
      <div className="space-y-1.5">
        <Label htmlFor="login-email">E-posta</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          disabled={isSubmitting}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (emailError) setEmailError(null);
            if (errorMessage) setErrorMessage(null);
          }}
          aria-invalid={emailError ? "true" : undefined}
          aria-describedby={
            emailError ? "login-email-error" : undefined
          }
        />
        {emailError ? (
          <p
            id="login-email-error"
            className="text-xs text-destructive"
          >
            {emailError}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="login-password">Şifre</Label>
        <div className="relative">
          <Input
            id="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={isSubmitting}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (passwordError) setPasswordError(null);
              if (errorMessage) setErrorMessage(null);
            }}
            aria-invalid={passwordError ? "true" : undefined}
            aria-describedby={
              passwordError
                ? "login-password-error"
                : "login-password-hint"
            }
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={isSubmitting}
            aria-label={
              showPassword ? "Şifreyi gizle" : "Şifreyi göster"
            }
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
            id="login-password-error"
            className="text-xs text-destructive"
          >
            {passwordError}
          </p>
        ) : (
          <p
            id="login-password-hint"
            className="text-xs text-muted-foreground"
          >
            Şifreniz büyük-küçük harf duyarlıdır.
          </p>
        )}
      </div>

      {errorMessage ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-destructive/30 bg-destructive-muted px-3 py-2 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <span className="inline-flex items-center gap-2">
            <Spinner size={16} label="Giriş yapılıyor" />
            <span>Giriş yapılıyor…</span>
          </span>
        ) : (
          "Giriş yap"
        )}
      </Button>

      <p className="pt-1 text-center text-xs text-muted-foreground">
        Satıcı hesapları davet ile oluşturulur.
      </p>
    </form>
  );
}
