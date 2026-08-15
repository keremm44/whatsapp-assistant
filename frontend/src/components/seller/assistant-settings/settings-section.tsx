"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";
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

/**
 * One editable settings section.
 *
 * SURFACE GRAMMAR
 *   Previously every section was a full-width raised `Surface` whose
 *   content was capped at `max-w-xl`. On a wide desktop that produced
 *   a large empty dark slab to the right of every form — the classic
 *   settings-card look, and the single biggest reason these pages felt
 *   like a different product from the rest of the workspace.
 *
 *   A section is now a RULED REGION on the page canvas: a heading, a
 *   description, the form column, and the section's own save action.
 *   Sections are separated from each other by a top rule (supplied by
 *   the workspace stack), so grouping stays obvious without four
 *   competing boxes. The material a seller looks at is the CONTROLS,
 *   which keep their own inset surface.
 *
 * CONTENT MEASURE
 *   `--settings-measure` (~34rem / 544px for ordinary controls, and
 *   the wider `measure="wide"` ~46rem for sections whose content
 *   genuinely benefits) gives the form a deliberate column instead of
 *   inheriting an arbitrary container width. Text inputs no longer
 *   stretch across the viewport just because the page is wide.
 *
 * SAVE OWNERSHIP IS UNCHANGED
 *   The section still owns exactly one primary save action, still
 *   anchored to the section by a hairline, with identical
 *   disabled/saving/saved/error/conflict behaviour and the same
 *   `aria-busy` + `role="status"` feedback.
 */
export function SettingsSection({
  title,
  description,
  note,
  children,
  canSave,
  status,
  onSave,
  saveLabel = SETTINGS_SAVE_LABEL,
  measure = "default",
}: {
  title: string;
  description: string;
  note?: React.ReactNode;
  children: React.ReactNode;
  canSave: boolean;
  status: SettingsSectionStatus;
  onSave: () => void;
  saveLabel?: string;
  /**
   * Form column width. `default` suits ordinary label+input stacks;
   * `wide` is for sections carrying paired grids or long text where a
   * narrow column would cramp the content.
   */
  measure?: "default" | "wide";
}) {
  const isSaving = status.kind === "saving";
  const statusMessage =
    status.kind === "saved"
      ? SETTINGS_SAVED_LABEL
      : status.kind === "error" || status.kind === "conflict"
        ? status.message
        : null;

  const measureClass = measure === "wide" ? "max-w-[46rem]" : "max-w-[34rem]";

  return (
    <section className="space-y-5" aria-labelledby={`${title}-heading`}>
        <div className="space-y-1.5">
          <h2
            id={`${title}-heading`}
            className="type-section text-foreground"
          >
            {title}
          </h2>
          <p className={cn("type-body text-muted", measureClass)}>
            {description}
          </p>
          {note}
        </div>
        <div className={cn("space-y-5", measureClass)}>{children}</div>
        {/* Section-level save: anchored to the section with a quiet
            hairline instead of floating alone in empty card space.
            Still the one obvious primary action when dirty. */}
        <div
          className={cn(
            "flex flex-col gap-2 border-t border-divider pt-3.5 sm:flex-row sm:items-center sm:gap-3",
            measureClass,
          )}
        >
          <Button
            type="button"
            size="sm"
            className="min-h-11 sm:min-h-9"
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
              saveLabel
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
  );
}
