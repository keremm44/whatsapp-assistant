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
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import { postUnansweredAction } from "@/lib/seller/unanswered-api";
import {
  buildDismissPayload,
  classifyUnansweredMutationFailure,
  UNANSWERED_DISMISS_CONFIRM_LABEL,
  UNANSWERED_DISMISS_EXPLANATION,
  UNANSWERED_DISMISS_NOTE_LABEL,
  UNANSWERED_DISMISS_NOTE_MAX_LENGTH,
  UNANSWERED_DISMISS_TRIGGER_LABEL,
} from "@/lib/seller/unanswered-format";
import { getBrowserAccessToken } from "@/lib/supabase/client";

/**
 * The deliberate dismiss flow — SECONDARY wherever the answer is the
 * primary action. Offered only for OPEN questions (the backend
 * rejects dismiss on ANSWERED, and DISMISSED is already dismissed).
 *
 * Dismiss is a stored business state, never deletion: no “Sil/Delete”
 * language anywhere. The note is optional and capped at the backend
 * limit; expected_version is the version rendered to the seller; the
 * note draft survives conflicts and transient failures; on success the
 * workspace re-resolves so the seller sees backend truth.
 */
export function UnansweredDismissDialog({
  groupId,
  version,
  onSuccess,
}: {
  groupId: number;
  /** The version rendered to the seller — sent as expected_version. */
  version: number;
  /** Called once after a successful dismiss; the workspace re-resolves. */
  onSuccess: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  // Seller-subtree portal host so the dialog inherits the
  // dark-workshop tokens (body-level portals escape `.seller-theme`).
  const [portalHost, setPortalHost] = React.useState<HTMLDivElement | null>(
    null,
  );

  return (
    <>
      <div ref={setPortalHost} className="contents" />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center rounded-md px-1 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {UNANSWERED_DISMISS_TRIGGER_LABEL}
      </button>
      {open ? (
        <DismissDialogBody
          groupId={groupId}
          version={version}
          onSuccess={onSuccess}
          onClose={() => setOpen(false)}
          portalContainer={portalHost}
        />
      ) : null}
    </>
  );
}

function DismissDialogBody({
  groupId,
  version,
  onSuccess,
  onClose,
  portalContainer,
}: {
  groupId: number;
  version: number;
  onSuccess: () => void;
  onClose: () => void;
  portalContainer: Element | DocumentFragment | null;
}) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [wasConflict, setWasConflict] = React.useState(false);
  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      inflightRef.current?.abort();
    };
  }, []);

  const onSubmit = async () => {
    if (isSubmitting || inflightRef.current) return;
    setActionError(null);
    setWasConflict(false);

    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);
    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        setActionError(
          "Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.",
        );
        return;
      }
      await postUnansweredAction(
        accessToken,
        groupId,
        buildDismissPayload({ version, note }),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      onSuccess();
    } catch (error) {
      if (controller.signal.aborted) return;
      const status = error instanceof ApiError ? error.status : null;
      const kind = classifyUnansweredMutationFailure(status);
      if (kind === "conflict") {
        // The record changed elsewhere: re-resolve truth, keep the
        // typed note, explain calmly.
        setWasConflict(true);
        router.refresh();
        return;
      }
      setActionError(
        kind === "validation"
          ? "İşlem tamamlanamadı. Lütfen notu kontrol edip tekrar deneyin."
          : "İşlem şu anda tamamlanamadı. Notunuz korundu; lütfen tekrar deneyin.",
      );
    } finally {
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="max-w-md" portalContainer={portalContainer}>
        <DialogTitle>{UNANSWERED_DISMISS_TRIGGER_LABEL}</DialogTitle>
        <DialogDescription>
          {UNANSWERED_DISMISS_EXPLANATION}
        </DialogDescription>

        <div className="space-y-1.5">
          <label
            htmlFor="unanswered-dismiss-note"
            className="block text-[12px] font-medium text-muted-foreground"
          >
            {UNANSWERED_DISMISS_NOTE_LABEL}
          </label>
          <textarea
            id="unanswered-dismiss-note"
            name="note"
            rows={3}
            value={note}
            disabled={isSubmitting}
            maxLength={UNANSWERED_DISMISS_NOTE_MAX_LENGTH}
            onChange={(event) => setNote(event.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
          />
        </div>

        {wasConflict ? (
          <p
            role="status"
            className="text-[12.5px] leading-snug text-muted-foreground"
          >
            Bu soru başka bir işlemle güncellendi; güncel hali getirildi.
          </p>
        ) : null}
        {actionError !== null ? (
          <p
            role="alert"
            className="text-[12.5px] leading-snug text-destructive"
          >
            {actionError}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => {
              void onSubmit();
            }}
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size={14} label="İşleniyor" />
                <span>İşleniyor…</span>
              </span>
            ) : (
              UNANSWERED_DISMISS_CONFIRM_LABEL
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Vazgeç
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
