"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";
import {
  SETTINGS_NO_LABEL,
  SETTINGS_TRISTATE_UNKNOWN_LABEL,
  SETTINGS_UNSPECIFIED_LABEL,
  SETTINGS_YES_LABEL,
  type TriStateValue,
} from "@/lib/seller/assistant-settings-format";
import { cn } from "@/lib/utils/cn";

export function formatReviewValue(
  value: string | number | boolean | null,
): string {
  if (value === null) return SETTINGS_UNSPECIFIED_LABEL;
  if (value === true) return SETTINGS_YES_LABEL;
  if (value === false) return SETTINGS_NO_LABEL;
  return String(value);
}

export function AuthoritativeReview({
  items,
}: {
  items: {
    label: string;
    current: string | number | boolean | null;
    draft: string | number | boolean | null;
  }[];
}) {
  const changed = items.filter((item) => !Object.is(item.current, item.draft));
  if (changed.length === 0) return null;
  return (
    <div className="space-y-1 rounded-md border border-border bg-surface-2 px-3 py-2">
      <p className="text-[12.5px] font-medium text-foreground">Kayıtlı değerler</p>
      {changed.map((item) => (
        <p key={item.label} className="text-[12.5px] text-muted-foreground">
          {item.label}: {formatReviewValue(item.current)}
        </p>
      ))}
    </div>
  );
}

export function FieldMessage({
  id,
  children,
  tone = "muted",
}: {
  id?: string;
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <p
      id={id}
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "text-[12.5px] leading-snug",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {children}
    </p>
  );
}

export function TriStateControl({
  legend,
  name,
  value,
  disabled,
  onChange,
  describedBy,
}: {
  legend: string;
  name: string;
  value: TriStateValue;
  disabled?: boolean;
  onChange: (next: TriStateValue) => void;
  describedBy?: string;
}) {
  const options: { id: string; label: string; next: TriStateValue }[] = [
    { id: `${name}-yes`, label: SETTINGS_YES_LABEL, next: true },
    { id: `${name}-no`, label: SETTINGS_NO_LABEL, next: false },
    {
      id: `${name}-unspecified`,
      // Backend NULL stays its own selectable state ("Bilgi yok");
      // it is never merged into "Hayır".
      label: SETTINGS_TRISTATE_UNKNOWN_LABEL,
      next: null,
    },
  ];

  return (
    <fieldset className="space-y-1.5" aria-describedby={describedBy}>
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      {/* Compact segments: full-width equal thirds on touch screens
          (>= 44px targets), a quiet inline pill group from sm up. */}
      <div className="flex w-full flex-wrap gap-1 rounded-md border border-border bg-surface p-0.5 sm:inline-flex sm:w-auto">
        {options.map((option) => {
          const selected = value === option.next;
          return (
            <label
              key={option.id}
              className={cn(
                "inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-sm px-3 text-[12.5px] font-medium transition-colors sm:min-h-8 sm:flex-initial",
                "focus-within:outline-none focus-within:ring-2 focus-within:ring-primary",
                selected
                  ? "bg-surface-2 text-foreground shadow-surface"
                  : "text-muted-foreground hover:text-foreground",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={option.id}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option.next)}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function BinaryChoiceControl({
  legend,
  name,
  value,
  disabled,
  onChange,
  describedBy,
}: {
  legend: string;
  name: string;
  value: boolean | null;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  describedBy?: string;
}) {
  const options: { id: string; label: string; next: boolean }[] = [
    { id: `${name}-yes`, label: SETTINGS_YES_LABEL, next: true },
    { id: `${name}-no`, label: SETTINGS_NO_LABEL, next: false },
  ];

  return (
    <fieldset className="space-y-1.5" aria-describedby={describedBy}>
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      {/* Compact segments: full-width equal thirds on touch screens
          (>= 44px targets), a quiet inline pill group from sm up. */}
      <div className="flex w-full flex-wrap gap-1 rounded-md border border-border bg-surface p-0.5 sm:inline-flex sm:w-auto">
        {options.map((option) => {
          const selected = value === option.next;
          return (
            <label
              key={option.id}
              className={cn(
                "inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-sm px-3 text-[12.5px] font-medium transition-colors sm:min-h-8 sm:flex-initial",
                "focus-within:outline-none focus-within:ring-2 focus-within:ring-primary",
                selected
                  ? "bg-surface-2 text-foreground shadow-surface"
                  : "text-muted-foreground hover:text-foreground",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={option.id}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option.next)}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function BooleanSettingControl({
  legend,
  name,
  value,
  help,
  disabled,
  onChange,
}: {
  legend: string;
  name: string;
  value: boolean | null;
  help?: string;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const helpId = help ? `${name}-help` : undefined;
  if (value === null) {
    return (
      <div className="space-y-2">
        <BinaryChoiceControl
          legend={legend}
          name={name}
          value={value}
          disabled={disabled}
          onChange={onChange}
          describedBy={helpId}
        />
        {help ? <FieldMessage id={helpId}>{help}</FieldMessage> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label
        className={cn(
          "flex min-h-11 cursor-pointer items-start gap-3 rounded-md",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <input
          type="checkbox"
          name={name}
          checked={value}
          disabled={disabled}
          aria-describedby={helpId}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        />
        <span className="space-y-1">
          <span className="block text-sm font-medium text-foreground">{legend}</span>
          {help ? (
            <span id={helpId} className="block text-[12.5px] leading-snug text-muted-foreground">
              {help}
            </span>
          ) : null}
        </span>
      </label>
    </div>
  );
}

export function LabeledTextField({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder,
  suffix,
  inputMode,
  describedBy,
  error,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  suffix?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  describedBy?: string;
  error?: string | null;
  maxLength?: number;
}) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          name={id}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          inputMode={inputMode}
          maxLength={maxLength}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={[describedBy, errorId].filter(Boolean).join(" ") || undefined}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "flex min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        {suffix ? (
          <span className="shrink-0 text-sm text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
      {error ? (
        <FieldMessage id={errorId} tone="error">
          {error}
        </FieldMessage>
      ) : null}
    </div>
  );
}
