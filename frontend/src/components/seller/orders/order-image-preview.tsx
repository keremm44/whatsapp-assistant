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
  orderImagePreviewInitial,
  reduceOrderImagePreview,
  resolveOrderImagePreview,
  type OrderImagePreviewState,
} from "@/lib/seller/orders-format";
import { fetchOrderImageMedia } from "@/lib/seller/orders-api";
import { getBrowserAccessToken } from "@/lib/supabase/client";

/**
 * Lightweight, lazy order-image preview.
 *
 * The binary is fetched ONLY on demand (the list never eagerly downloads
 * images) through the backend's authenticated, tenant-scoped media proxy
 * (`GET /seller/messages/{id}/media`). The raw provider URL never exists
 * on this surface — bytes arrive as a Blob and are shown via a local
 * object URL that is revoked on close/unmount (no leaks).
 *
 * Failure behavior: any media failure (proxy closed, network, token)
 * stays inside the dialog as calm feedback with an optional retry. The
 * orders list itself is never affected, and no technical detail (status
 * codes, host names, internal codes) is surfaced.
 *
 * Radix Dialog supplies the interaction contract: Escape closes, focus
 * is trapped while open and returned to the "Görsel" action on close.
 */
export function OrderImagePreview({
  imageMessageId,
  orderNumber,
  open,
  onOpenChange,
}: {
  imageMessageId: number;
  /** Marketplace order number for context/alt text; may be pending. */
  orderNumber: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, dispatch] = React.useReducer(
    reduceOrderImagePreview,
    orderImagePreviewInitial,
  );
  const [attempt, setAttempt] = React.useState(0);
  const objectUrlRef = React.useRef<string | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);
  // Seller-subtree portal host so the dialog inherits the
  // dark-workshop tokens (body-level portals escape `.seller-theme`).
  const [portalHost, setPortalHost] = React.useState<HTMLDivElement | null>(
    null,
  );

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
      const result = await resolveOrderImagePreview(
        () =>
          fetchOrderImageMedia(accessToken, imageMessageId, {
            signal: controller.signal,
          }),
        (blob) => URL.createObjectURL(blob),
      );
      if (controller.signal.aborted) {
        // The URL was created after the dialog closed: revoke immediately
        // instead of handing it to the ref (no leaks on late resolutions).
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
  }, [open, attempt, imageMessageId, releaseObjectUrl]);

  React.useEffect(() => {
    return () => {
      inflightRef.current?.abort();
      releaseObjectUrl();
    };
  }, [releaseObjectUrl]);

  const imageAlt =
    orderNumber !== null
      ? `Sipariş ${orderNumber} baskı görseli`
      : "Sipariş baskı görseli";

  return (
    <>
    <div ref={setPortalHost} className="contents" />
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
      <DialogContent className="max-w-2xl" portalContainer={portalHost}>
        <DialogTitle>Baskı görseli</DialogTitle>
        <DialogDescription>
          {orderNumber !== null
            ? `Sipariş ${orderNumber} için müşterinin gönderdiği görsel.`
            : "Müşterinin gönderdiği sipariş görseli."}
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
    </>
  );
}

function PreviewBody({
  state,
  imageAlt,
}: {
  state: OrderImagePreviewState;
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
