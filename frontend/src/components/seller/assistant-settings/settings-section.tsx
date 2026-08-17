"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";

import {
  SETTINGS_FIELD_MEASURE,
  SETTINGS_FIELD_MEASURE_WIDE,
  SETTINGS_SHEET_MEASURE,
} from "./settings-measure";
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
 *   This has been tuned between two failure modes. Originally every
 *   section was a full-width raised `Surface` capped at `max-w-xl`,
 *   which produced a large empty dark slab to the right of each form.
 *   Removing that slab fixed the card look but went too far the other
 *   way: a narrow form column floating on a very wide bare canvas,
 *   reading as raw HTML rather than a work area.
 *
 *   The middle ground is a CONTAINED WORK SHEET. The section owns a
 *   quiet `raised` region at the shared sheet measure — wide enough to
 *   feel deliberate, narrow enough that its right edge stays visible —
 *   with no shadow, no border stack and no nested boxes. Sections are
 *   still separated by rules supplied by the workspace stack, so
 *   grouping is obvious without four competing cards.
 *
 * CONTENT MEASURE
 *   Two nested measures (see `settings-measure.ts`): the sheet holds
 *   the work area, and the FORM COLUMN inside it is narrower still —
 *   ~34rem for ordinary label+input stacks, or the wider step for
 *   sections carrying paired grids. Text inputs no longer stretch
 *   across the viewport just because the page is wide.
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
  density = "default",
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
  /**
   * Vertical rhythm of the form column. `default` suits label+input
   * stacks that need breathing room; `compact` suits quick-scan
   * checklists of short segmented questions (Kullanım), which
   * otherwise stretch into an unnecessarily long sparse column.
   * Purely spacing — no value, label or control semantics change.
   */
  density?: "default" | "compact";
}) {
  const isSaving = status.kind === "saving";
  const statusMessage =
    status.kind === "saved"
      ? SETTINGS_SAVED_LABEL
      : status.kind === "error" || status.kind === "conflict"
        ? status.message
        : null;

  const measureClass =
    measure === "wide" ? SETTINGS_FIELD_MEASURE_WIDE : SETTINGS_FIELD_MEASURE;

  return (
    <section aria-labelledby={`${title}-heading`}>
      {/* Contained operational work sheet: quiet raised material, one
          soft sheet radius, no shadow and no nested card. */}
      <div
        className={cn(
          "space-y-5 rounded-sheet bg-raised shadow-surface border border-boundary/60 px-4 py-5 md:px-6 md:py-6",
          SETTINGS_SHEET_MEASURE,
        )}
      >
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
        <div
          className={cn(
            density === "compact" ? "space-y-3.5" : "space-y-5",
            measureClass,
          )}
        >
          {children}
        </div>
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
      </div>
    </section>
  );
}
