"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SellerFreshnessNotice } from "@/components/seller/freshness/seller-freshness-banner";
import type { ConversationListBootstrap } from "@/lib/seller/conversations-server";
import {
  fetchConversationList,
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
  decideOffsetPageAdvance,
  ownsLoadMoreLifecycle,
} from "@/lib/seller/offset-pagination";
import { getBrowserAccessToken } from "@/lib/supabase/client";

import { PausedRow } from "./paused-row";

const PAUSED_CONTROL_STATE = "ASSISTANT_PAUSED" as const;

/**
 * Read-only paused queue. Pagination and freshness follow the
 * Conversations list contract with an exact backend
 * `control_state=ASSISTANT_PAUSED` filter — never a client-side
 * slice of the generic conversation page.
 */
export function PausedListPanel({
  bootstrap,
}: {
  bootstrap: ConversationListBootstrap;
}) {
  const ready = bootstrap.state === "ready" ? bootstrap : null;

  const [rows, setRows] = React.useState<ConversationListItem[]>(
    ready?.page.conversations ?? [],
  );
  const [total, setTotal] = React.useState(ready?.page.total ?? 0);
  const [nextOffset, setNextOffset] = React.useState(
    ready ? ready.page.offset + ready.page.conversations.length : 0,
  );
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [loadMoreError, setLoadMoreError] = React.useState<string | null>(
    null,
  );
  const [moreAvailable, setMoreAvailable] = React.useState(
    ready ? ready.page.conversations.length < ready.page.total : false,
  );
  const inflightRef = React.useRef<AbortController | null>(null);
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;

  // Re-seed from the server payload whenever it changes (refreshes
  // and freshness re-resolutions all arrive as a new bootstrap).
  React.useEffect(() => {
    // The bootstrap replacing the list context is the stale-request
    // boundary: abort any in-flight load-more NOW so a late response
    // from the OLD context can never append rows, move the offset,
    // change total/moreAvailable or set an error against the fresh
    // state, and release the single-in-flight gate + loading flag
    // for the new context.
    cancelInflightLoadMore(inflightRef);
    setIsLoadingMore(false);
    if (bootstrap.state === "ready") {
      setRows(bootstrap.page.conversations);
      setTotal(bootstrap.page.total);
      setNextOffset(
        bootstrap.page.offset + bootstrap.page.conversations.length,
      );
      setMoreAvailable(
        bootstrap.page.conversations.length < bootstrap.page.total,
      );
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
      let offset = nextOffset;
      let working = rowsRef.current;
      let autoContinues = 0;
      let latestTotal = total;

      while (true) {
        const page = await fetchConversationList(accessToken, {
          controlState: PAUSED_CONTROL_STATE,
          offset,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        const seen = new Set(working.map((row) => row.customer.id));
        const fresh = page.conversations.filter(
          (row) => !seen.has(row.customer.id),
        );
        working = [...working, ...fresh];
        latestTotal = page.total;
        setRows(working);
        setTotal(latestTotal);

        const decision = decideOffsetPageAdvance({
          incomingCount: page.conversations.length,
          appendedCount: fresh.length,
          incomingOffset: page.offset,
          pageSize: page.limit,
          autoContinueCount: autoContinues,
          moreRule: {
            kind: "global_total",
            loadedCount: working.length,
            total: latestTotal,
          },
        });
        offset = decision.nextOffset;
        setNextOffset(offset);

        if (decision.shouldAutoContinue) {
          autoContinues += 1;
          continue;
        }
        setMoreAvailable(decision.moreAvailable);
        break;
      }
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
        const page = await fetchConversationList(accessToken, {
          controlState: PAUSED_CONTROL_STATE,
          offset: 0,
          signal,
        });
        return signaturesDiffer(
          buildPausedListFreshnessSignature({
            total: ready?.page.total ?? 0,
            conversations: ready?.page.conversations ?? [],
          }),
          buildPausedListFreshnessSignature({
            total: page.total,
            conversations: page.conversations,
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
