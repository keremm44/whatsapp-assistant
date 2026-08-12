"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  reduceReturnEvidencePreview,
  resolveReturnEvidencePreview,
  returnEvidencePreviewInitial,
  type ReturnEvidencePreviewState,
} from "@/lib/seller/returns-format";
import { fetchReturnEvidenceMedia } from "@/lib/seller/returns-api";
import { getBrowserAccessToken } from "@/lib/supabase/client";

/**
 * Lazy, authenticated evidence-image preview.
 *
 * The binary is fetched ONLY on demand (the detail area never eagerly
 * downloads images) through the backend's authenticated, tenant-scoped
 * media proxy (`GET /seller/messages/{id}/media`). The raw provider URL
 * never exists on this surface — bytes arrive as a Blob and are shown
 * via a local object URL that is revoked on close/unmount (no leaks).
 *
 * The image is evidence FOR THE SELLER: no AI verdict, no confidence,
 * no "hasar doğrulandı" language anywhere.
 *
 * Failure behavior: any media failure (proxy closed, network, token)
 * stays inside the dialog as calm feedback with an optional retry. The
 * detail area is never affected, and no technical detail (status codes,
 * host names, internal codes) is surfaced.
 *
 * Radix Dialog supplies the interaction contract: Escape closes, focus
 * is trapped while open and returned to the evidence action on close.
 */
export function ReturnEvidencePreview({
  messageId,
  position,
  total,
  open,
  onOpenChange,
  portalContainer,
}: {
  messageId: number;
  /** 1-based position within the evidence list, for alt copy. */
  position: number;
  total: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Seller-subtree portal host so the dialog inherits the
   * dark-workshop tokens (body-level portals escape `.seller-theme`).
   */
  portalContainer?: Element | DocumentFragment | null;
}) {
  const [state, dispatch] = React.useReducer(
    reduceReturnEvidencePreview,
    returnEvidencePreviewInitial,
  );
  const [attempt, setAttempt] = React.useState(0);
  const objectUrlRef = React.useRef<string | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);

  const releaseObjectUrl = React.useCallback(() => {
    if (objectUrlRef.current !== null) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const close = React.useCallback(() => {
    inflightRef.current?.abort();
    releaseObjectUrl();
    dispatch({ type: "close" });
    onOpenChange(false);
  }, [onOpenChange, releaseObjectUrl]);

  React.useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    inflightRef.current = controller;
    dispatch({ type: "open" });

    const load = async () => {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        dispatch({ type: "failed" });
        return;
      }
      const result = await resolveReturnEvidencePreview(
        () =>
          fetchReturnEvidenceMedia(accessToken, messageId, {
            signal: controller.signal,
          }),
        (blob) => URL.createObjectURL(blob),
      );
      if (controller.signal.aborted) {
        // The URL was created after the dialog closed: revoke
        // immediately instead of handing it to the ref (no leaks on
        // late resolutions).
        if (result.ok) URL.revokeObjectURL(result.objectUrl);
        return;
      }
      if (!result.ok) {
        dispatch({ type: "failed" });
        return;
      }
      objectUrlRef.current = result.objectUrl;
      dispatch({
        type: "loaded",
        objectUrl: result.objectUrl,
        contentType: result.contentType,
      });
    };

    void load();

    return () => {
      controller.abort();
      releaseObjectUrl();
    };
  }, [open, attempt, messageId, releaseObjectUrl]);

  React.useEffect(() => {
    return () => {
      inflightRef.current?.abort();
      releaseObjectUrl();
    };
  }, [releaseObjectUrl]);

  const imageAlt =
    total > 1
      ? `Müşterinin gönderdiği kanıt fotoğrafı ${position} / ${total}`
      : "Müşterinin gönderdiği kanıt fotoğrafı";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
        } else {
          close();
        }
      }}
    >
      <DialogContent className="max-w-2xl" portalContainer={portalContainer}>
        <DialogTitle>Kanıt fotoğrafı</DialogTitle>
        <DialogDescription>
          {total > 1
            ? `Müşterinin gönderdiği ${total} kanıt fotoğrafından ${position}. görsel.`
            : "Müşterinin gönderdiği kanıt fotoğrafı."}
        </DialogDescription>

        <PreviewBody state={state} imageAlt={imageAlt} />

        {state.phase === "error" ? (
          <div className="flex justify-start">
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
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({
  state,
  imageAlt,
}: {
  state: ReturnEvidencePreviewState;
  imageAlt: string;
}) {
  if (state.phase === "loading") {
    return (
      <div
        className="flex min-h-48 items-center justify-center"
        role="status"
      >
        <Spinner size={18} label="Görsel yükleniyor" />
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-1.5 text-center">
        <p className="text-sm font-medium text-foreground">
          Görsel şu anda açılamıyor.
        </p>
        <p className="text-[13px] text-muted-foreground">
          Bağlantıyı kontrol edip tekrar deneyebilirsiniz.
        </p>
      </div>
    );
  }

  if (state.phase === "ready") {
    return (
      <div className="flex min-h-48 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- object URL blob, no static optimization possible */}
        <img
          src={state.objectUrl}
          alt={imageAlt}
          className="max-h-[70vh] w-auto max-w-full rounded-sm object-contain"
        />
      </div>
    );
  }

  return null;
}
