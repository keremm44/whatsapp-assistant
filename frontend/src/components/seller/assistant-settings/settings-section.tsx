"use client";

import * as React from "react";

import { Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  SETTINGS_SAVE_LABEL,
  SETTINGS_SAVED_LABEL,
  SETTINGS_SAVING_LABEL,
} from "@/lib/seller/assistant-settings-format";

export type SettingsSectionStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string }
  | { kind: "conflict"; message: string };

export function SettingsSection({
  title,
  description,
  note,
  children,
  canSave,
  status,
  onSave,
}: {
  title: string;
  description: string;
  note?: React.ReactNode;
  children: React.ReactNode;
  canSave: boolean;
  status: SettingsSectionStatus;
  onSave: () => void;
}) {
  const isSaving = status.kind === "saving";
  const statusMessage =
    status.kind === "saved"
      ? SETTINGS_SAVED_LABEL
      : status.kind === "error" || status.kind === "conflict"
        ? status.message
        : null;

  return (
    <Surface className="px-4 py-5 md:px-5">
      <section className="space-y-5" aria-labelledby={`${title}-heading`}>
        <div className="space-y-1.5">
          <h2
            id={`${title}-heading`}
            className="font-heading text-lg text-foreground sm:text-xl"
          >
            {title}
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
          {note}
        </div>
        <div className="max-w-xl space-y-5">{children}</div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            className="min-h-11"
            disabled={!canSave || isSaving}
            aria-busy={isSaving}
            onClick={onSave}
          >
            {isSaving ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size={14} label={SETTINGS_SAVING_LABEL} />
                <span>{SETTINGS_SAVING_LABEL}</span>
              </span>
            ) : (
              SETTINGS_SAVE_LABEL
            )}
          </Button>
          {statusMessage ? (
            <p
              role="status"
              className={
                status.kind === "saved"
                  ? "text-[13px] text-muted-foreground"
                  : "text-[13px] text-destructive"
              }
            >
              {statusMessage}
            </p>
          ) : null}
        </div>
      </section>
    </Surface>
  );
}
