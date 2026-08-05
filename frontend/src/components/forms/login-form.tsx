"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form-field";
import { signIn } from "@/lib/api/auth";
import {
  loginSchema,
  type LoginFormValues,
} from "@/lib/validation/application";

export function LoginForm({ admin = false }: { admin?: boolean }) {
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const onSubmit = async (values: LoginFormValues) => {
    setSubmitError("");
    try {
      await signIn(values);
    } catch {
      setSubmitError(
        "Giriş bağlantısı şu anda hazır değil. Lütfen daha sonra yeniden deneyin.",
      );
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <FormField
        id={admin ? "admin-email" : "email"}
        label="E-posta"
        error={errors.email?.message}
      >
        <Input
          id={admin ? "admin-email" : "email"}
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={
            errors.email
              ? `${admin ? "admin-email" : "email"}-error`
              : undefined
          }
          {...register("email")}
        />
      </FormField>
      <FormField
        id={admin ? "admin-password" : "password"}
        label="Şifre"
        error={errors.password?.message}
      >
        <Input
          id={admin ? "admin-password" : "password"}
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          aria-describedby={
            errors.password
              ? `${admin ? "admin-password" : "password"}-error`
              : undefined
          }
          {...register("password")}
        />
      </FormField>
      {submitError ? (
        <p
          role="alert"
          className="rounded-lg border border-[#e5b9aa] bg-[#fff2ed] p-3 text-sm text-[var(--error)]"
        >
          {submitError}
        </p>
      ) : null}
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting
          ? "Kontrol ediliyor…"
          : admin
            ? "Admin Girişi"
            : "Giriş Yap"}
      </Button>
    </form>
  );
}
