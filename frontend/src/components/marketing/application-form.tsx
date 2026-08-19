"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import { submitSellerApplication } from "@/lib/marketing/seller-application-api";
import {
  SELLER_APPLICATION_LIMITS,
  validateSellerApplication,
  type SellerApplicationFieldErrors,
} from "@/lib/marketing/seller-application";
import { cn } from "@/lib/utils/cn";

/**
 * Public seller application form — wired to the real, unauthenticated
 * `POST /applications` endpoint. No secret is ever exposed; the request
 * goes through the shared `apiFetch` client and the backend remains
 * authoritative for validation and phone normalization.
 *
 * State machine is intentionally calm:
 *   idle -> submitting -> success (backend's own message)
 *                     -> error   (backend message or a quiet retry note)
 */
export function ApplicationForm() {
  const [values, setValues] = React.useState({
    fullName: "",
    storeName: "",
    phone: "",
    email: "",
    productCategory: "",
    storeLink: "",
    notes: "",
  });
  const [fieldErrors, setFieldErrors] =
    React.useState<SellerApplicationFieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const setField = (key: keyof typeof values, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    }
    if (formError) setFormError(null);
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setFormError(null);
    setSuccessMessage(null);

    const { errors, normalized } = validateSellerApplication(values);
    setFieldErrors(errors);
    const hasErrors = Object.values(errors).some(Boolean);
    if (hasErrors) return;

    setIsSubmitting(true);
    try {
      const result = await submitSellerApplication(normalized);
      setSuccessMessage(result.message);
      setValues({
        fullName: "",
        storeName: "",
        phone: "",
        email: "",
        productCategory: "",
        storeLink: "",
        notes: "",
      });
    } catch (error) {
      if (error instanceof ApiError && error.message) {
        setFormError(error.message);
      } else {
        setFormError(
          "Başvurunuz şu anda alınamadı. Lütfen kısa süre sonra tekrar deneyin.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successMessage) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-sheet border border-success-muted bg-success-muted px-5 py-6"
      >
        <p className="type-row-primary text-foreground">
          Başvurunuz alındı.
        </p>
        <p className="mt-1.5 max-w-prose type-body text-muted">
          {successMessage}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={isSubmitting} className="space-y-5">
      <Field
        id="app-name"
        label="Ad soyad"
        required
        error={fieldErrors.fullName}
      >
        <Input
          id="app-name"
          value={values.fullName}
          onChange={(event) => setField("fullName", event.target.value)}
          autoComplete="name"
          required
          maxLength={SELLER_APPLICATION_LIMITS.fullNameMax}
          aria-invalid={fieldErrors.fullName ? "true" : undefined}
          disabled={isSubmitting}
        />
      </Field>

      <Field
        id="app-store"
        label="Mağaza adı"
        required
        error={fieldErrors.storeName}
      >
        <Input
          id="app-store"
          value={values.storeName}
          onChange={(event) => setField("storeName", event.target.value)}
          required
          maxLength={SELLER_APPLICATION_LIMITS.storeNameMax}
          aria-invalid={fieldErrors.storeName ? "true" : undefined}
          disabled={isSubmitting}
        />
      </Field>

      <Field id="app-phone" label="Telefon" required error={fieldErrors.phone}>
        <Input
          id="app-phone"
          type="tel"
          inputMode="tel"
          value={values.phone}
          onChange={(event) => setField("phone", event.target.value)}
          autoComplete="tel"
          required
          maxLength={SELLER_APPLICATION_LIMITS.phoneMaxDigits + 3}
          aria-invalid={fieldErrors.phone ? "true" : undefined}
          disabled={isSubmitting}
        />
      </Field>

      <Field id="app-email" label="E-posta" optional error={fieldErrors.email}>
        <Input
          id="app-email"
          type="email"
          inputMode="email"
          value={values.email}
          onChange={(event) => setField("email", event.target.value)}
          autoComplete="email"
          maxLength={SELLER_APPLICATION_LIMITS.emailMax}
          aria-invalid={fieldErrors.email ? "true" : undefined}
          disabled={isSubmitting}
        />
      </Field>

      <Field
        id="app-category"
        label="Ürün kategorisi"
        optional
        error={fieldErrors.productCategory}
      >
        <Input
          id="app-category"
          value={values.productCategory}
          onChange={(event) => setField("productCategory", event.target.value)}
          placeholder="Örn. seramik kupa, giyim, kozmetik"
          maxLength={SELLER_APPLICATION_LIMITS.categoryMax}
          aria-invalid={fieldErrors.productCategory ? "true" : undefined}
          disabled={isSubmitting}
        />
      </Field>

      <Field
        id="app-link"
        label="Mağaza bağlantısı"
        optional
        error={fieldErrors.storeLink}
      >
        <Input
          id="app-link"
          type="url"
          inputMode="url"
          value={values.storeLink}
          onChange={(event) => setField("storeLink", event.target.value)}
          placeholder="https://…"
          maxLength={SELLER_APPLICATION_LIMITS.storeLinkMax}
          aria-invalid={fieldErrors.storeLink ? "true" : undefined}
          disabled={isSubmitting}
        />
      </Field>

      <Field id="app-notes" label="Not" optional error={fieldErrors.notes}>
        <textarea
          id="app-notes"
          value={values.notes}
          onChange={(event) => setField("notes", event.target.value)}
          rows={3}
          maxLength={SELLER_APPLICATION_LIMITS.notesMax}
          disabled={isSubmitting}
          className={cn(
            "w-full rounded-control border border-boundary bg-control px-3 py-2 text-[15px] leading-[22px] text-foreground shadow-inset placeholder:text-muted-foreground transition-colors hover:border-primary/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      </Field>

      {formError ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-control border border-destructive/30 bg-destructive-muted px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
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
            <Spinner size={16} label="Başvuru gönderiliyor" />
            <span>Gönderiliyor…</span>
          </span>
        ) : (
          "Başvuruyu gönder"
        )}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  optional,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            {" "}
            *
          </span>
        ) : null}
        {optional ? (
          <span className="font-normal text-muted-foreground"> (isteğe bağlı)</span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
