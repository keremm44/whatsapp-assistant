"use client";

import * as React from "react";
import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import {
  fetchReturnIssueSettings,
  updateReturnIssueSetting,
} from "@/lib/seller/returns-api";
import type {
  ReturnImageRequirement,
  ReturnIssueSetting,
  ReturnIssueType,
} from "@/lib/seller/returns";
import {
  buildReturnSettingUpdatePayload,
  classifyReturnMutationFailure,
  RETURN_IMAGE_REQUIREMENT_OPTIONS,
} from "@/lib/seller/returns-format";
import { getBrowserAccessToken } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

/**
 * “Fotoğraf tercihleri” — the secondary settings surface for the six
 * canonical issue types' image requirements.
 *
 * Deliberately NOT the page's primary action: a quiet secondary button
 * opening a focused dialog. The dialog owns its own data lifecycle
 * (lazy fetch on open), so a settings failure can never break the
 * operational list behind it.
 *
 * Contract discipline:
 *   - backend display_name is rendered verbatim; values are the three
 *     canonical image_requirement states with the brief's locked
 *     meaning copy (OPTIONAL is never described as “asistan ister”).
 *   - each issue type is one calm row; changing a value dirties only
 *     that row; saving is an explicit per-row PATCH carrying the
 *     row's current expected_version.
 *   - on success the returned setting/version becomes the new truth;
 *     on 409 all settings are refetched and the seller is told the
 *     current value changed elsewhere; other failures keep the draft
 *     and allow retry.
 */
export function ReturnPhotoPreferences() {
  const [open, setOpen] = React.useState(false);
  // Seller-subtree portal host so the dialog inherits the
  // dark-workshop tokens (body-level portals escape `.seller-theme`) —
  // the same contract as conversation-detail-panel.
  const [portalHost, setPortalHost] = React.useState<HTMLDivElement | null>(
    null,
  );

  return (
    <>
      <div ref={setPortalHost} className="contents" />
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={() => setOpen(true)}
        className="w-full gap-2 sm:w-auto"
      >
        <Settings2 aria-hidden="true" size={15} strokeWidth={1.75} />
        <span>Fotoğraf tercihleri</span>
      </Button>
      <PreferencesDialog
        open={open}
        onOpenChange={setOpen}
        portalContainer={portalHost}
      />
    </>
  );
}

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; settings: ReturnIssueSetting[] }
  | { phase: "error" };

function PreferencesDialog({
  open,
  onOpenChange,
  portalContainer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portalContainer?: Element | DocumentFragment | null;
}) {
  const [loadState, setLoadState] = React.useState<LoadState>({
    phase: "loading",
  });
  const [drafts, setDrafts] = React.useState<
    Partial<Record<ReturnIssueType, ReturnImageRequirement>>
  >({});
  const [savingType, setSavingType] =
    React.useState<ReturnIssueType | null>(null);
  const [rowError, setRowError] =
    React.useState<Partial<Record<ReturnIssueType, string>>>({});
  const [conflictNotice, setConflictNotice] = React.useState<string | null>(
    null,
  );
  const [attempt, setAttempt] = React.useState(0);
  const inflightRef = React.useRef<AbortController | null>(null);

  const load = React.useCallback(async (signal: AbortSignal) => {
    const accessToken = await getBrowserAccessToken();
    if (signal.aborted) return;
    if (!accessToken) {
      setLoadState({ phase: "error" });
      return;
    }
    try {
      const settings = await fetchReturnIssueSettings(accessToken, {
        signal,
      });
      if (signal.aborted) return;
      // Fresh backend truth clears every draft: a dirty value must
      // never silently override a version the seller cannot see.
      setDrafts({});
      setRowError({});
      setConflictNotice(null);
      setLoadState({ phase: "ready", settings });
    } catch {
      if (signal.aborted) return;
      setLoadState({ phase: "error" });
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    inflightRef.current = controller;
    setLoadState({ phase: "loading" });
    void load(controller.signal);
    return () => {
      controller.abort();
    };
    // `attempt` re-runs the load for explicit retry.
  }, [open, attempt, load]);

  React.useEffect(() => {
    return () => {
      inflightRef.current?.abort();
    };
  }, []);

  const onSave = async (setting: ReturnIssueSetting) => {
    const draft = drafts[setting.issueType];
    if (draft === undefined || draft === setting.imageRequirement) return;
    if (savingType !== null) return;
    setRowError((previous) => ({ ...previous, [setting.issueType]: undefined }));
    setConflictNotice(null);
    setSavingType(setting.issueType);

    const controller = new AbortController();
    inflightRef.current = controller;
    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        setRowError((previous) => ({
          ...previous,
          [setting.issueType]:
            "Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.",
        }));
        return;
      }
      const result = await updateReturnIssueSetting(
        accessToken,
        setting.issueType,
        buildReturnSettingUpdatePayload({
          version: setting.version,
          imageRequirement: draft,
        }),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      // The returned setting/version is the new source of truth.
      const saved = result.setting;
      setLoadState((previous) =>
        previous.phase === "ready"
          ? {
              phase: "ready",
              settings: previous.settings.map((row) =>
                row.issueType === saved.issueType ? saved : row,
              ),
            }
          : previous,
      );
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[setting.issueType];
        return next;
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const status = error instanceof ApiError ? error.status : null;
      if (classifyReturnMutationFailure(status) === "conflict") {
        // Someone else changed values: refetch truth, drop drafts.
        setConflictNotice(
          "Tercihler başka bir işlemle değiştirildi; güncel değerler getirildi.",
        );
        void load(controller.signal);
        return;
      }
      setRowError((previous) => ({
        ...previous,
        [setting.issueType]:
          "Tercih kaydedilemedi. Seçiminiz korunuyor; lütfen tekrar deneyin.",
      }));
    } finally {
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      setSavingType(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] max-w-xl overflow-y-auto"
        portalContainer={portalContainer}
      >
        <DialogTitle>Fotoğraf tercihleri</DialogTitle>
        <DialogDescription>
          Asistanın her sorun türünde müşteriden fotoğraf isteyip
          istemeyeceğini belirleyin. Müşterinin kendiliğinden gönderdiği
          fotoğraflar her durumda kanıt olarak saklanabilir.
        </DialogDescription>

        {conflictNotice !== null ? (
          <p
            role="status"
            className="rounded-md border border-divider bg-surface-2/50 px-3 py-2 text-[12.5px] leading-snug text-muted-foreground"
          >
            {conflictNotice}
          </p>
        ) : null}

        {loadState.phase === "loading" ? (
          <div
            className="flex min-h-32 items-center justify-center"
            role="status"
          >
            <Spinner size={18} label="Tercihler yükleniyor" />
          </div>
        ) : null}

        {loadState.phase === "error" ? (
          <div className="space-y-3" role="status">
            <p className="text-sm font-medium text-foreground">
              Tercihler şu anda yüklenemedi.
            </p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Bağlantı kurulamadı. Liste bundan etkilenmez; tekrar
              deneyebilirsiniz.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Tekrar dene
            </Button>
          </div>
        ) : null}

        {loadState.phase === "ready" ? (
          <ul aria-label="Sorun türüne göre fotoğraf tercihleri">
            {loadState.settings.map((setting) => {
              const draft = drafts[setting.issueType];
              const current = draft ?? setting.imageRequirement;
              const dirty =
                draft !== undefined && draft !== setting.imageRequirement;
              const selectedOption = RETURN_IMAGE_REQUIREMENT_OPTIONS.find(
                (option) => option.value === current,
              );
              const isSaving = savingType === setting.issueType;
              const errorMessage = rowError[setting.issueType];

              return (
                <li
                  key={setting.issueType}
                  className="border-t border-divider py-3.5 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <label
                        htmlFor={`return-pref-${setting.issueType}`}
                        className="block text-[13px] font-medium text-foreground"
                      >
                        {setting.displayName}
                      </label>
                      <select
                        id={`return-pref-${setting.issueType}`}
                        value={current}
                        disabled={isSaving}
                        onChange={(event) => {
                          const next = event.target
                            .value as ReturnImageRequirement;
                          setDrafts((previous) => ({
                            ...previous,
                            [setting.issueType]: next,
                          }));
                          setRowError((previousRow) => ({
                            ...previousRow,
                            [setting.issueType]: undefined,
                          }));
                        }}
                        className="h-10 w-full max-w-56 rounded-md border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 sm:w-56"
                      >
                        {RETURN_IMAGE_REQUIREMENT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {selectedOption ? (
                        <p className="max-w-md text-[12px] leading-relaxed text-muted-foreground">
                          {selectedOption.description}
                        </p>
                      ) : null}
                    </div>
                    {dirty ? (
                      <div className="shrink-0">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={isSaving}
                          aria-busy={isSaving}
                          onClick={() => {
                            void onSave(setting);
                          }}
                        >
                          {isSaving ? (
                            <span className="inline-flex items-center gap-2">
                              <Spinner size={14} label="Kaydediliyor" />
                              <span>Kaydediliyor…</span>
                            </span>
                          ) : (
                            "Kaydet"
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {errorMessage ? (
                    <p
                      role="alert"
                      className={cn(
                        "mt-2 text-[12px] leading-snug text-destructive",
                      )}
                    >
                      {errorMessage}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
