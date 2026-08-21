"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SellerFreshnessNotice } from "@/components/seller/freshness/seller-freshness-banner";
import type { ConversationListBootstrap } from "@/lib/seller/conversations-server";
import {
  fetchConversationListV2,
  type ConversationListItem,
} from "@/lib/seller/conversations";
import {
  PAUSED_EMPTY_COPY,
  PAUSED_UNAVAILABLE_COPY,
} from "@/lib/seller/paused-format";
import {
  buildPausedListFreshnessSignature,
  signaturesDiffer,
} from "@/lib/seller/freshness";
import {
  cancelInflightLoadMore,
  ownsLoadMoreLifecycle,
} from "@/lib/seller/offset-pagination";
import { getBrowserAccessToken } from "@/lib/supabase/client";

import { PausedRow } from "./paused-row";

const PAUSED_CONTROL_STATE = "ASSISTANT_PAUSED" as const;

/**
 * Read-only paused queue. Pagination and freshness follow the
 * Conversations v2 cursor contract with an exact backend
 * `control_state=ASSISTANT_PAUSED` filter — never a client-side
 * slice of the generic conversation page. The v2 contract carries no
 * global total; "Daha fazla göster" follows `has_more` exactly and
 * pages are fetched with the previous `next_cursor` (signed and bound
 * to this seller + filter set).
 */
export function PausedListPanel({
  bootstrap,
}: {
  bootstrap: ConversationListBootstrap;
}) {
  const ready = bootstrap.state === "ready" ? bootstrap : null;

  const [rows, setRows] = React.useState<ConversationListItem[]>(
    ready?.page.items ?? [],
  );
  const [nextCursor, setNextCursor] = React.useState<string | null>(
    ready?.page.nextCursor ?? null,
  );
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [loadMoreError, setLoadMoreError] = React.useState<string | null>(
    null,
  );
  const [moreAvailable, setMoreAvailable] = React.useState(
    ready?.page.hasMore ?? false,
  );
  const inflightRef = React.useRef<AbortController | null>(null);
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;
  const nextCursorRef = React.useRef(nextCursor);
  nextCursorRef.current = nextCursor;

  // Re-seed from the server payload whenever it changes (refreshes
  // and freshness re-resolutions all arrive as a new bootstrap — the
  // cursor is part of the reset).
  React.useEffect(() => {
    // The bootstrap replacing the list context is the stale-request
    // boundary: abort any in-flight load-more NOW so a late response
    // from the OLD context can never append rows, move the cursor,
    // change moreAvailable or set an error against the fresh state,
    // and release the single-in-flight gate + loading flag for the
    // new context.
    cancelInflightLoadMore(inflightRef);
    setIsLoadingMore(false);
    if (bootstrap.state === "ready") {
      setRows(bootstrap.page.items);
      setNextCursor(bootstrap.page.nextCursor);
      setMoreAvailable(bootstrap.page.hasMore);
      setLoadMoreError(null);
    }
  }, [bootstrap]);

  React.useEffect(() => {
    return () => {
      inflightRef.current?.abort();
    };
  }, []);

  const onLoadMore = async () => {
    if (isLoadingMore || inflightRef.current) return;
    setLoadMoreError(null);

    const controller = new AbortController();
    inflightRef.current = controller;
    setIsLoadingMore(true);
    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        setLoadMoreError(
          "Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.",
        );
        return;
      }
      const cursor = nextCursorRef.current;
      if (cursor === null) {
        // The backend said there was no next page; stop honestly.
        setMoreAvailable(false);
        return;
      }

      const page = await fetchConversationListV2(accessToken, {
        controlState: PAUSED_CONTROL_STATE,
        cursor,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      // Append with a customer-id dedupe safety net (a row whose
      // activity moved across the cursor boundary can repeat).
      const working = rowsRef.current;
      const seen = new Set(working.map((row) => row.customer.id));
      const fresh = page.items.filter((row) => !seen.has(row.customer.id));
      setRows([...working, ...fresh]);
      setNextCursor(page.nextCursor);
      setMoreAvailable(page.hasMore);
    } catch {
      if (controller.signal.aborted) return;
      setLoadMoreError(
        "Liste şu anda genişletilemedi. Lütfen tekrar deneyin.",
      );
    } finally {
      // Only the request that still owns the lifecycle may release the
      // shared state — a request cancelled by a context change (ref
      // already cleared) or superseded by a newer one must not stomp
      // the newer request's loading/controller state.
      if (ownsLoadMoreLifecycle(inflightRef, controller)) {
        inflightRef.current = null;
        setIsLoadingMore(false);
      }
    }
  };

  const freshness = (
    <SellerFreshnessNotice
      enabled={ready !== null}
      check={async (signal) => {
        const accessToken = await getBrowserAccessToken();
        if (!accessToken) return false;
        const page = await fetchConversationListV2(accessToken, {
          controlState: PAUSED_CONTROL_STATE,
          signal,
        });
        return signaturesDiffer(
          buildPausedListFreshnessSignature({
            total: ready?.page.items.length ?? 0,
            conversations: ready?.page.items ?? [],
          }),
          buildPausedListFreshnessSignature({
            total: page.items.length,
            conversations: page.items,
          }),
        );
      }}
    />
  );

  if (!ready) {
    return <PausedListUnavailable />;
  }

  if (rows.length === 0) {
    return (
      <div>
        {freshness}
        <div className="px-4 py-10 md:px-5" role="status">
          <p className="text-sm font-medium text-foreground">
            {PAUSED_EMPTY_COPY.title}
          </p>
          <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
            {PAUSED_EMPTY_COPY.description}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {freshness}
      <ul role="list" aria-label="Yanıtı durdurulan konuşmalar">
        {rows.map((item) => (
          <PausedRow
            key={item.customer.id}
            item={item}
            renderedAt={ready.renderedAt}
          />
        ))}
      </ul>

      {moreAvailable || loadMoreError ? (
        <div className="space-y-2 px-4 py-3 md:px-5">
          {moreAvailable ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              aria-busy={isLoadingMore}
            >
              {isLoadingMore ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size={14} label="Yükleniyor" />
                  <span>Yükleniyor…</span>
                </span>
              ) : (
                "Daha fazla göster"
              )}
            </Button>
          ) : null}
          {loadMoreError ? (
            <p
              role="alert"
              className="text-center text-[12px] text-destructive"
            >
              {loadMoreError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PausedListUnavailable() {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!isPending) {
      setIsRetrying(false);
    }
  }, [isPending]);

  const onRetry = () => {
    if (isRetrying || isPending) return;
    setIsRetrying(true);
    startTransition(() => {
      router.refresh();
    });
  };

  const disabled = isRetrying || isPending;

  return (
    <div className="space-y-3 px-4 py-10 md:px-5" role="status">
      <p className="text-sm font-medium text-foreground">
        {PAUSED_UNAVAILABLE_COPY.title}
      </p>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {PAUSED_UNAVAILABLE_COPY.description}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onRetry}
        disabled={disabled}
        aria-busy={disabled}
      >
        Tekrar dene
      </Button>
    </div>
  );
}
