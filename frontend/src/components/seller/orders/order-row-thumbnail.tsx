"use client";

import * as React from "react";
import { Image as ImageIcon, ImageOff } from "lucide-react";

import {
  orderImagePreviewInitial,
  reduceOrderImagePreview,
  resolveOrderImagePreview,
} from "@/lib/seller/orders-format";
import { fetchOrderImageMedia } from "@/lib/seller/orders-api";
import { getBrowserAccessToken } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

/**
 * Inline order thumbnail — the list row's image quick action.
 *
 * MEDIA SOURCE: the existing authenticated, tenant-scoped media proxy
 * (`fetchOrderImageMedia` → `GET /seller/messages/{id}/media`), exactly
 * the same path `OrderImagePreview` already uses. Bytes arrive as a
 * Blob and are shown through a local object URL that is revoked on
 * unmount. No provider URL is constructed, no new endpoint is added,
 * and `imageMessageId` is never rendered to the user.
 *
 * NOT AN N+1 DETAIL FETCH: this never calls `fetchOrderDetail`. It
 * reads `imageMessageId` straight off the list summary the page already
 * has, so no order-detail request is issued for any row.
 *
 * LOAD DISCIPLINE: the row does not eagerly download every image on
 * mount. Loading is deferred until the row is actually near the
 * viewport (IntersectionObserver), so a long queue scroll does not
 * fan out requests for rows the seller never looks at. Where the
 * observer is unavailable the component simply loads immediately.
 *
 * FAILURE: any media failure degrades to a restrained placeholder that
 * STILL communicates "this order has an image" — the row is never
 * removed and never loses its data because a picture failed.
 */
export function OrderRowThumbnail({
  imageMessageId,
  className,
}: {
  imageMessageId: number;
  className?: string;
}) {
  const [state, dispatch] = React.useReducer(
    reduceOrderImagePreview,
    orderImagePreviewInitial,
  );
  const [shouldLoad, setShouldLoad] = React.useState(false);
  const hostRef = React.useRef<HTMLSpanElement | null>(null);
  const objectUrlRef = React.useRef<string | null>(null);

  // Defer the media request until the row approaches the viewport.
  React.useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!shouldLoad) return;

    const controller = new AbortController();
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
        // Resolved after unmount/abort: revoke instead of leaking.
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
      if (objectUrlRef.current !== null) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [shouldLoad, imageMessageId]);

  return (
    <span
      ref={hostRef}
      aria-hidden="true"
      className={cn(
        // Order content, not a decorative card: recessed well, one
        // quiet boundary, control-radius, no shadow.
        "relative block shrink-0 overflow-hidden rounded-control border border-divider bg-sunken",
        "h-12 w-12 md:h-11 md:w-11",
        className,
      )}
    >
      {state.phase === "ready" ? (
        /* eslint-disable-next-line @next/next/no-img-element -- object URL blob, no static optimization possible */
        <img
          src={state.objectUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground">
          {state.phase === "error" ? (
            // Still says "there is an image here", just not viewable now.
            <ImageOff size={16} strokeWidth={1.75} />
          ) : (
            <ImageIcon size={16} strokeWidth={1.75} />
          )}
        </span>
      )}
    </span>
  );
}
