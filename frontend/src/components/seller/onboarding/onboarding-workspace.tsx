"use client";

import * as React from "react";
import { Check, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import {
  completeOnboardingStep,
  fetchOnboardingStatus,
  startOnboardingStep,
} from "@/lib/seller/onboarding-api";
import {
  buildOnboardingStepData,
  deriveOnboardingFormFields,
  initialOnboardingDraft,
  type OnboardingDraft,
  type OnboardingFormField,
} from "@/lib/seller/onboarding-form";
import type {
  OnboardingSchema,
  OnboardingStatus,
  OnboardingStatusStep,
} from "@/lib/seller/onboarding";
import type { OnboardingBootstrap } from "@/lib/seller/onboarding-server";
import { getBrowserAccessToken } from "@/lib/supabase/client";

const STATUS_LABELS = {
  locked: "Kilitli",
  available: "Hazır",
  in_progress: "Devam ediyor",
  completed: "Tamamlandı",
} as const;

const humanizeField = (value: string): string =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("tr-TR"));

const mutationMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return "Bu adım başka bir oturumda değişmiş olabilir. Sayfayı yenileyip tekrar deneyin.";
    }
    if (error.status === 422) {
      return error.message || "Girilen bilgiler backend doğrulamasından geçmedi.";
    }
  }
  return "İşlem şu anda tamamlanamadı. Bilgileriniz değiştirilmedi.";
};

const FieldControl = ({
  field,
  value,
  disabled,
  onChange,
}: {
  field: OnboardingFormField;
  value: string | boolean | null | undefined;
  disabled: boolean;
  onChange: (value: string | boolean | null) => void;
}) => {
  const id = `onboarding-${field.key}`;
  const title = humanizeField(field.title);

  if (field.constTrue || field.kind === "boolean") {
    return (
      <div className="rounded-xl border border-border/70 bg-background/40 p-4">
        <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">{title}</span>
            {field.description ? (
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {field.description}
              </span>
            ) : null}
          </span>
        </label>
      </div>
    );
  }

  if (field.kind === "nullable_boolean") {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{title}</Label>
        <select
          id={id}
          value={value === true ? "true" : value === false ? "false" : "null"}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              event.target.value === "true"
                ? true
                : event.target.value === "false"
                  ? false
                  : null,
            )
          }
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="null">Belirtilmedi</option>
          <option value="true">Evet</option>
          <option value="false">Hayır</option>
        </select>
        {field.description ? (
          <p className="text-xs leading-5 text-muted-foreground">{field.description}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {title}
        {field.required ? " *" : ""}
      </Label>
      <Input
        id={id}
        type={field.kind === "integer" ? "number" : "text"}
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        min={field.minimum ?? undefined}
        max={field.maximum ?? undefined}
        minLength={field.minLength ?? undefined}
        maxLength={field.maxLength ?? undefined}
        required={field.required}
        onChange={(event) => onChange(event.target.value)}
      />
      {field.description ? (
        <p className="text-xs leading-5 text-muted-foreground">{field.description}</p>
      ) : null}
    </div>
  );
};

const StepCard = ({
  schema,
  step,
  active,
}: {
  schema: OnboardingSchema["steps"][number];
  step: OnboardingStatusStep;
  active: boolean;
}) => (
  <div
    className={`rounded-xl border px-4 py-3 ${
      active ? "border-primary/50 bg-primary/5" : "border-border/60 bg-card/45"
    }`}
  >
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 text-xs font-semibold">
        {step.status === "completed" ? <Check className="h-4 w-4" /> : step.stepOrder}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{schema.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{STATUS_LABELS[step.status]}</p>
      </div>
      {step.status === "locked" ? (
        <LockKeyhole className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      ) : null}
    </div>
  </div>
);

export const OnboardingWorkspace = ({ bootstrap }: { bootstrap: OnboardingBootstrap }) => {
  const ready = bootstrap.state === "ready" ? bootstrap : null;
  const [status, setStatus] = React.useState<OnboardingStatus | null>(
    ready?.status ?? null,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const schema = ready?.schema ?? null;
  const currentStep = status?.steps.find(
    (step) => step.stepOrder === status.currentOnboardingStep,
  );
  const currentSchema = schema?.steps.find(
    (step) => step.stepOrder === status?.currentOnboardingStep,
  );
  const fields = React.useMemo(
    () => (currentSchema ? deriveOnboardingFormFields(currentSchema.schema) : []),
    [currentSchema],
  );
  const [draft, setDraft] = React.useState<OnboardingDraft>({});

  React.useEffect(() => {
    if (!currentStep) return;
    setDraft(initialOnboardingDraft(fields, currentStep.stepData));
    setError(null);
  }, [currentStep, fields]);

  if (bootstrap.state !== "ready" || !status || !schema) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card/60 p-6">
        <h2 className="text-base font-semibold text-foreground">Kurulum bilgileri okunamadı</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Kurulum durumu şu anda doğrulanamadı. Mevcut ayarlar değiştirilmedi.
        </p>
      </div>
    );
  }

  const refreshStatus = async (accessToken: string) => {
    const next = await fetchOnboardingStatus(accessToken);
    setStatus(next);
  };

  const runStart = async () => {
    if (!currentStep || currentStep.status !== "available") return;
    setBusy(true);
    setError(null);
    try {
      const accessToken = await getBrowserAccessToken();
      if (!accessToken) throw new Error("session_unavailable");
      await startOnboardingStep(accessToken, currentStep.stepOrder);
      await refreshStatus(accessToken);
    } catch (cause) {
      setError(mutationMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const runComplete = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentStep || currentStep.status === "locked" || currentStep.status === "completed") {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const accessToken = await getBrowserAccessToken();
      if (!accessToken) throw new Error("session_unavailable");
      const next = await completeOnboardingStep(
        accessToken,
        currentStep.stepOrder,
        buildOnboardingStepData(fields, draft),
      );
      setStatus(next);
    } catch (cause) {
      setError(mutationMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const completedCount = status.steps.filter((step) => step.status === "completed").length;

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="rounded-2xl border border-border/70 bg-card/60 p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Kurulum ilerlemesi
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {completedCount}/10
              </p>
            </div>
            <span className="text-sm text-muted-foreground">%{completedCount * 10}</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${completedCount * 10}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          {status.steps.map((step) => {
            const stepSchema = schema.steps.find(
              (candidate) => candidate.stepOrder === step.stepOrder,
            );
            if (!stepSchema) return null;
            return (
              <StepCard
                key={step.id}
                step={step}
                schema={stepSchema}
                active={!status.onboardingCompleted && step.stepOrder === status.currentOnboardingStep}
              />
            );
          })}
        </div>
      </aside>

      <section className="rounded-2xl border border-border/70 bg-card/60 p-5 sm:p-6">
        {status.onboardingCompleted ? (
          <div className="max-w-xl">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Kurulum tamamlandı
            </p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">10 adım tamamlandı</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Kurulum verileri sunucu tarafından tamamlanmış olarak işaretlendi. Bundan sonraki erişim ve aktivasyon durumu hesap kurallarına göre belirlenir.
            </p>
          </div>
        ) : currentStep && currentSchema ? (
          <form onSubmit={runComplete} className="max-w-2xl space-y-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Adım {currentStep.stepOrder} / 10
              </p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">{currentSchema.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Alanlar sunucunun doğrulama sözleşmesinden oluşturulur. Kaydetme kararı ve sıra kontrolü sunucudadır.
              </p>
            </div>

            {currentStep.status === "available" ? (
              <div className="rounded-xl border border-border/70 bg-background/35 p-4">
                <p className="text-sm text-muted-foreground">
                  Adım hazır. Başlattığınızda kurulum ilerlemesi kaydedilir.
                </p>
                <Button type="button" className="mt-3" disabled={busy} onClick={runStart}>
                  Adımı başlat
                </Button>
              </div>
            ) : null}

            <div className="grid gap-5 sm:grid-cols-2">
              {fields.map((field) => (
                <FieldControl
                  key={field.key}
                  field={field}
                  value={draft[field.key]}
                  disabled={busy || currentStep.status === "available"}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, [field.key]: value }))
                  }
                />
              ))}
            </div>

            {fields.length === 0 ? (
              <p className="rounded-xl border border-border/70 bg-background/35 p-4 text-sm text-muted-foreground">
                Bu adım kullanıcıdan ek alan istemiyor. Sunucu sözleşmesinde yeni zorunlu alan oluşursa burada görünür.
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end border-t border-border/60 pt-5">
              <Button
                type="submit"
                disabled={busy || currentStep.status !== "in_progress"}
              >
                Adımı tamamla
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aktif kurulum adımı mevcut kurulum sözleşmesiyle eşleştirilemedi.
          </p>
        )}
      </section>
    </div>
  );
};