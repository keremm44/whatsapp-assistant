"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import {
  buildCreateFieldPayload,
  buildUpdateFieldPayload,
  choiceLabelsAreValid,
  FIELD_LABEL_MAX_LENGTH,
  isChoiceFieldType,
  PRODUCT_FIELD_TYPES,
  type ProductFieldDefinition,
  type ProductFieldType,
} from "@/lib/seller/products";
import {
  createProductField,
  updateProductField,
} from "@/lib/seller/products-api";
import {
  classifyProductsMutationFailure,
  FIELD_CONFLICT_MESSAGE,
  FIELD_CREATE_LABEL,
  FIELD_DEACTIVATE_EXPLANATION,
  FIELD_DUPLICATE_MESSAGE,
  FIELD_IMMUTABLE_NOTE,
  FIELD_LABEL_LABEL,
  FIELD_OPTIONAL_HELP,
  FIELD_OPTIONS_LABEL,
  FIELD_REQUIRED_HELP,
  FIELD_REQUIRED_LABEL,
  FIELD_TYPE_LABEL,
  getFieldTypeLabel,
  PRODUCTS_DEACTIVATE_LABEL,
  PRODUCTS_REACTIVATE_LABEL,
} from "@/lib/seller/products-format";
import { getBrowserAccessToken } from "@/lib/supabase/client";

const usePortalHost = () => {
  const [host, setHost] = React.useState<HTMLDivElement | null>(null);
  return { host, setHost };
};

export function FieldCreateDialog({
  productId,
  nextSortOrder,
}: {
  productId: number;
  nextSortOrder: number;
}) {
  const router = useRouter();
  const { host, setHost } = usePortalHost();
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [fieldType, setFieldType] = React.useState<ProductFieldType>("short_text");
  const [isRequired, setIsRequired] = React.useState(true);
  const [optionLabels, setOptionLabels] = React.useState(["", ""]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => inflightRef.current?.abort(), []);

  const needsOptions = isChoiceFieldType(fieldType);

  const reset = () => {
    setLabel("");
    setFieldType("short_text");
    setIsRequired(true);
    setOptionLabels(["", ""]);
    setError(null);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting || inflightRef.current) return;
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Alan adı zorunludur.");
      return;
    }
    if (needsOptions && !choiceLabelsAreValid(optionLabels)) {
      setError("En az iki farklı, boş olmayan seçenek girin.");
      return;
    }
    setError(null);
    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);
    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        setError("Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.");
        return;
      }
      await createProductField(
        accessToken,
        buildCreateFieldPayload({
          productId,
          label: trimmed,
          fieldType,
          isRequired,
          sortOrder: nextSortOrder,
          optionLabels: needsOptions ? optionLabels : undefined,
        }),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      reset();
      setOpen(false);
      router.refresh();
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError) {
        const kind = classifyProductsMutationFailure(caught.status);
        if (kind === "conflict") {
          setError(FIELD_DUPLICATE_MESSAGE);
          return;
        }
        if (kind === "validation") {
          setError("Alan bilgileri geçersiz. Lütfen kontrol edip tekrar deneyin.");
          return;
        }
      }
      setError(
        "İşlem şu anda tamamlanamadı. Girdiğiniz bilgiler korundu; lütfen tekrar deneyin.",
      );
    } finally {
      if (inflightRef.current === controller) inflightRef.current = null;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div ref={setHost} className="contents" />
      <Button type="button" size="md" onClick={() => setOpen(true)}>
        {FIELD_CREATE_LABEL}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false);
            setError(null);
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-lg overflow-y-auto"
          portalContainer={host}
        >
          <DialogTitle>{FIELD_CREATE_LABEL}</DialogTitle>
          <DialogDescription>
            Müşteriden sipariş sırasında istenmesini istediğiniz bilgiyi tanımlayın.
          </DialogDescription>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="field-create-label">{FIELD_LABEL_LABEL}</Label>
              <Input
                id="field-create-label"
                name="label"
                value={label}
                maxLength={FIELD_LABEL_MAX_LENGTH}
                disabled={isSubmitting}
                placeholder="Kupaya yazılacak isim"
                onChange={(event) => setLabel(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="field-create-type">{FIELD_TYPE_LABEL}</Label>
              <select
                id="field-create-type"
                name="field_type"
                value={fieldType}
                disabled={isSubmitting}
                onChange={(event) =>
                  setFieldType(event.target.value as ProductFieldType)
                }
                className="flex h-11 w-full rounded-md border border-border bg-control px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
              >
                {PRODUCT_FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {getFieldTypeLabel(type)}
                  </option>
                ))}
              </select>
            </div>
            {needsOptions ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-foreground">
                  {FIELD_OPTIONS_LABEL}
                </legend>
                {optionLabels.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Label
                      htmlFor={`field-option-${index}`}
                      className="sr-only"
                    >
                      Seçenek {index + 1}
                    </Label>
                    <Input
                      id={`field-option-${index}`}
                      value={option}
                      disabled={isSubmitting}
                      onChange={(event) => {
                        const next = [...optionLabels];
                        next[index] = event.target.value;
                        setOptionLabels(next);
                      }}
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-h-11"
                  disabled={isSubmitting}
                  onClick={() => setOptionLabels([...optionLabels, ""])}
                >
                  Seçenek ekle
                </Button>
              </fieldset>
            ) : null}
            <div className="space-y-2">
              <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={isRequired}
                  disabled={isSubmitting}
                  onChange={(event) => setIsRequired(event.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <span>{FIELD_REQUIRED_LABEL}</span>
              </label>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                {isRequired ? FIELD_REQUIRED_HELP : FIELD_OPTIONAL_HELP}
              </p>
            </div>
            {error ? (
              <p role="alert" className="text-[12.5px] leading-snug text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size={14} label="Kaydediliyor" />
                    <span>Kaydediliyor…</span>
                  </span>
                ) : (
                  "Kaydet"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => setOpen(false)}
              >
                Vazgeç
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function FieldEditDialog({
  field,
  disabled = false,
}: {
  field: ProductFieldDefinition;
  /**
   * Shared field-mutation lock from the field list: while a reorder
   * (or its authoritative refresh) is active, the trigger is native
   * disabled AND an already-open dialog's Kaydet cannot launch a
   * PATCH against the same soon-stale field version. Typed form
   * state is preserved; nothing auto-closes.
   */
  disabled?: boolean;
}) {
  const router = useRouter();
  const { host, setHost } = usePortalHost();
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState(field.label);
  const [isRequired, setIsRequired] = React.useState(field.isRequired);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    setLabel(field.label);
    setIsRequired(field.isRequired);
  }, [field.id, field.label, field.isRequired, field.version]);

  React.useEffect(() => () => inflightRef.current?.abort(), []);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    // The shared lock also guards the already-open-dialog sequence:
    // a submit while the list is mid-reorder/refresh would reuse a
    // stale field.version and manufacture an avoidable conflict.
    if (disabled || isSubmitting || inflightRef.current) return;
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Alan adı zorunludur.");
      return;
    }
    setError(null);
    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);
    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        setError("Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.");
        return;
      }
      await updateProductField(
        accessToken,
        field.id,
        buildUpdateFieldPayload({
          version: field.version,
          label: trimmed,
          isRequired,
        }),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setOpen(false);
      router.refresh();
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (
        caught instanceof ApiError &&
        classifyProductsMutationFailure(caught.status) === "conflict"
      ) {
        setError(FIELD_CONFLICT_MESSAGE);
        router.refresh();
        return;
      }
      setError("İşlem şu anda tamamlanamadı. Girdiğiniz metin korundu.");
    } finally {
      if (inflightRef.current === controller) inflightRef.current = null;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div ref={setHost} className="contents" />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="min-h-11"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Düzenle
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false);
            setError(null);
          }
        }}
      >
        <DialogContent className="max-w-md" portalContainer={host}>
          <DialogTitle>Alanı düzenle</DialogTitle>
          <DialogDescription>{FIELD_IMMUTABLE_NOTE}</DialogDescription>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`field-edit-label-${field.id}`}>
                {FIELD_LABEL_LABEL}
              </Label>
              <Input
                id={`field-edit-label-${field.id}`}
                value={label}
                maxLength={FIELD_LABEL_MAX_LENGTH}
                disabled={isSubmitting}
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
            <p className="text-[12.5px] text-muted-foreground">
              Tür: {getFieldTypeLabel(field.fieldType)}
            </p>
            <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={isRequired}
                disabled={isSubmitting}
                onChange={(event) => setIsRequired(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <span>{FIELD_REQUIRED_LABEL}</span>
            </label>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              {isRequired ? FIELD_REQUIRED_HELP : FIELD_OPTIONAL_HELP}
            </p>
            {error ? (
              <p role="alert" className="text-[12.5px] leading-snug text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                disabled={disabled || isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? "Kaydediliyor…" : "Kaydet"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => setOpen(false)}
              >
                Vazgeç
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function FieldStatusDialog({
  field,
  disabled = false,
}: {
  field: ProductFieldDefinition;
  /** Shared field-mutation lock — same contract as FieldEditDialog. */
  disabled?: boolean;
}) {
  const router = useRouter();
  const { host, setHost } = usePortalHost();
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);
  const nextActive = !field.isActive;

  React.useEffect(() => () => inflightRef.current?.abort(), []);

  const onConfirm = async () => {
    // Same already-open-dialog guard as FieldEditDialog.
    if (disabled || isSubmitting || inflightRef.current) return;
    setError(null);
    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);
    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        setError("Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.");
        return;
      }
      await updateProductField(
        accessToken,
        field.id,
        buildUpdateFieldPayload({
          version: field.version,
          isActive: nextActive,
        }),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setOpen(false);
      router.refresh();
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (
        caught instanceof ApiError &&
        classifyProductsMutationFailure(caught.status) === "conflict"
      ) {
        setError(FIELD_CONFLICT_MESSAGE);
        router.refresh();
        return;
      }
      setError("İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.");
    } finally {
      if (inflightRef.current === controller) inflightRef.current = null;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div ref={setHost} className="contents" />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="min-h-11"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {field.isActive ? PRODUCTS_DEACTIVATE_LABEL : PRODUCTS_REACTIVATE_LABEL}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false);
            setError(null);
          }
        }}
      >
        <DialogContent className="max-w-md" portalContainer={host}>
          <DialogTitle>
            {field.isActive ? PRODUCTS_DEACTIVATE_LABEL : PRODUCTS_REACTIVATE_LABEL}
          </DialogTitle>
          <DialogDescription>
            {field.isActive
              ? FIELD_DEACTIVATE_EXPLANATION
              : "Bu alan yeniden etkinleştirildiğinde yeni siparişlerde tekrar kullanılabilir."}
          </DialogDescription>
          {error ? (
            <p role="alert" className="text-[12.5px] leading-snug text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={disabled || isSubmitting}
              aria-busy={isSubmitting}
              onClick={() => {
                void onConfirm();
              }}
            >
              {isSubmitting ? "Kaydediliyor…" : "Onayla"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isSubmitting}
              onClick={() => setOpen(false)}
            >
              Vazgeç
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
