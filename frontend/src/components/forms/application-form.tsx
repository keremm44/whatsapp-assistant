"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { submitSellerApplication } from "@/lib/api/applications";
import {
  applicationSchema,
  type ApplicationFormInput,
  type ApplicationFormValues,
} from "@/lib/validation/application";

export function ApplicationForm() {
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationFormInput, unknown, ApplicationFormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      fullName: "",
      whatsappPhone: "",
      storeName: "",
      storeUrl: "",
      note: "",
      contactConsent: false,
    },
  });
  const onSubmit = async (values: ApplicationFormValues) => {
    setSubmitError("");
    try {
      await submitSellerApplication({
        ...values,
        note: values.note || undefined,
      });
    } catch {
      setSubmitError(
        "Başvuru bağlantısı şu anda hazırlanıyor. Lütfen daha sonra yeniden deneyin.",
      );
    }
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
      aria-describedby={submitError ? "application-submit-error" : undefined}
    >
      <FormField
        id="fullName"
        label="Ad soyad"
        error={errors.fullName?.message}
      >
        <Input
          id="fullName"
          autoComplete="name"
          aria-invalid={!!errors.fullName}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
          {...register("fullName")}
        />
      </FormField>
      <FormField
        id="whatsappPhone"
        label="WhatsApp telefon numarası"
        error={errors.whatsappPhone?.message}
      >
        <Input
          id="whatsappPhone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="05xx xxx xx xx"
          aria-invalid={!!errors.whatsappPhone}
          aria-describedby={
            errors.whatsappPhone ? "whatsappPhone-error" : undefined
          }
          {...register("whatsappPhone")}
        />
      </FormField>
      <FormField
        id="storeName"
        label="Mağaza adı"
        error={errors.storeName?.message}
      >
        <Input
          id="storeName"
          autoComplete="organization"
          aria-invalid={!!errors.storeName}
          aria-describedby={errors.storeName ? "storeName-error" : undefined}
          {...register("storeName")}
        />
      </FormField>
      <FormField
        id="storeUrl"
        label="Mağaza bağlantısı (isteğe bağlı)"
        error={errors.storeUrl?.message}
      >
        <Input
          id="storeUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          aria-invalid={!!errors.storeUrl}
          aria-describedby={errors.storeUrl ? "storeUrl-error" : undefined}
          {...register("storeUrl")}
        />
      </FormField>
      <FormField
        id="note"
        label="Kısa not (isteğe bağlı)"
        error={errors.note?.message}
        hint="En fazla 500 karakter"
      >
        <Textarea
          id="note"
          placeholder="En çok hangi konuda desteğe ihtiyacınız var?"
          maxLength={500}
          aria-invalid={!!errors.note}
          aria-describedby={errors.note ? "note-error" : "note-hint"}
          {...register("note")}
        />
      </FormField>
      <div>
        <label
          htmlFor="contactConsent"
          className="flex cursor-pointer items-start gap-3 text-sm leading-6"
        >
          <input
            id="contactConsent"
            type="checkbox"
            className="mt-1 size-4 accent-[var(--green)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green)]"
            aria-invalid={!!errors.contactConsent}
            aria-describedby={
              errors.contactConsent ? "contactConsent-error" : undefined
            }
            {...register("contactConsent")}
          />
          <span>
            Başvurum hakkında WhatsApp üzerinden mesaj gönderilmesini kabul
            ediyorum.
          </span>
        </label>
        {errors.contactConsent ? (
          <p
            id="contactConsent-error"
            role="alert"
            className="mt-2 text-sm text-[var(--error)]"
          >
            {errors.contactConsent.message}
          </p>
        ) : null}
      </div>
      {submitError ? (
        <p
          id="application-submit-error"
          role="alert"
          className="rounded-lg border border-[#e5b9aa] bg-[#fff2ed] p-3 text-sm text-[var(--error)]"
        >
          {submitError}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full sm:w-auto"
      >
        {isSubmitting ? "Gönderiliyor…" : "Bilgilerimi Gönder"}
      </Button>
      <p className="text-xs leading-5 text-[var(--muted)]">
        Bu form hesap oluşturmaz ve ödeme başlatmaz. Bilgilerinizi inceleyip
        size WhatsApp üzerinden mesaj göndeririz.
      </p>
    </form>
  );
}
