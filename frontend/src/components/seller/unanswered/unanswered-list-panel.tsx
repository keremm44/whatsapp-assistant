"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type {
  UnansweredQuestionSummary,
  UnansweredView,
} from "@/lib/seller/unanswered";
import { fetchUnansweredListV2 } from "@/lib/seller/unanswered-api";
import {
  mergeUnansweredPage,
  UNANSWERED_PAGE_SIZE,
  unansweredListEmptyCopy,
} from "@/lib/seller/unanswered-format";
import { SellerFreshnessNotice } from "@/components/seller/freshness/seller-freshness-banner";
import {
  buildIdVersionSignature,
  signaturesDiffer,
} from "@/lib/seller/freshness";
import {
  cancelInflightLoadMore,
  ownsLoadMoreLifecycle,
} from "@/lib/seller/offset-pagination";
import type { UnansweredListBootstrap } from "@/lib/seller/unanswered-server";
import { getBrowserAccessToken } from "@/lib/supabase/client";

import { UnansweredQuestionRow } from "./unanswered-question-row";

/**
 * The unanswered-question queue body.
 *
 * Data flow mirrors the Returns/Orders queues: the server page
 * resolves the FIRST page (view already applied) and passes the parsed
 * bootstrap down; this component only ever fetches FURTHER pages in
 * the browser via the session token. When the bootstrap changes (tab
 * switch, retry refresh), local pagination state is re-seeded from
 * the new first page — the cursor resets, stale rows cannot survive,
 * and the backend's keyset ordering (last_seen_at DESC, id DESC) is
 * preserved verbatim.
 *
 * Pagination contract (GET /seller/unanswered-questions/v2,
 * contracts/seller-lists-v2.json): the backend is authoritative —
 * “Daha fazla göster” is offered exactly while `has_more` is true, and
 * each page is fetched with the previous `next_cursor` (signed and
 * bound to this seller + view). New pages are APPENDED to the loaded
 * rows; a fixed limit never hides results. Rows whose last_seen_at
 * moved across the cursor boundary are deduped by group id as a
 * safety net.
 *
 * Failure discipline: an initial list failure renders a calm retry
 * surface and never fakes an empty queue; load-more failures keep the
 * already-loaded rows.
 */
export function UnansweredListPanel({
  bootstrap,
  view,
  selectedQuestionId,
}: {
  bootstrap: UnansweredListBootstrap;
  view: UnansweredView;
  selectedQuestionId: number | null;
}) {
  const ready = bootstrap.state === "ready" ? bootstrap : null;

  const [rows, setRows] = React.useState<UnansweredQuestionSummary[]>(
    ready?.page.items ?? [],
  );
  const [nextCursor, setNextCursor] = React.useState<string | null>(
    ready?.page.nextCursor ?? null,
  );
  const [moreAvailable, setMoreAvailable] = React.useState(
    ready?.page.hasMore ?? false,
  );
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [loadMoreError, setLoadMoreError] = React.useState<string | null>(
    null,
  );
  const inflightRef = React.useRef<AbortController | null>(null);
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;
  const nextCursorRef = React.useRef(nextCursor);
  nextCursorRef.current = nextCursor;

  // Re-seed from the server payload whenever it changes (view
  // switches and refreshes all arrive as a new bootstrap — the cursor
  // is part of the reset).
  React.useEffect(() => {
    // The bootstrap replacing the list context is the stale-request
    // boundary: abort any in-flight load-more NOW so a late response
    // from the OLD context can never append rows, move the cursor or
    // set an error against the fresh state, and release the
    // single-in-flight gate + loading flag for the new context.
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

      const page = await fetchUnansweredListV2(accessToken, {
        view,
        limit: UNANSWERED_PAGE_SIZE,
        cursor,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      // Append with an id-based dedupe safety net (rows whose
      // last_seen_at moved across the cursor boundary can repeat).
      const working = mergeUnansweredPage(rowsRef.current, page.items);
      setRows(working);
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
      key={view}
      enabled={ready !== null}
      check={async (signal) => {
        const accessToken = await getBrowserAccessToken();
        if (!accessToken) return false;
        const page = await fetchUnansweredListV2(accessToken, {
          view,
          limit: UNANSWERED_PAGE_SIZE,
          signal,
        });
        return signaturesDiffer(
          buildIdVersionSignature(ready?.page.items ?? []),
          buildIdVersionSignature(page.items),
        );
      }}
    />
  );

  if (!ready) {
    return <UnansweredListUnavailable />;
  }

  if (rows.length === 0) {
    const empty = unansweredListEmptyCopy(view);
    return (
      <div>
        {freshness}
        <div className="px-4 py-8 md:px-5" role="status">
          <p className="text-sm font-medium text-foreground">{empty.title}</p>
          {empty.description ? (
            <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              {empty.description}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      {freshness}
      <ul role="list" aria-label="Cevaplanamayan sorular">
        {rows.map((question) => (
          <UnansweredQuestionRow
            key={question.id}
            question={question}
            isSelected={question.id === selectedQuestionId}
            view={view}
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

/**
 * Honest failure surface: the queue never fakes emptiness. The retry
 * re-runs the server page (same mechanics as the other queues), which
 * re-resolves without touching the auth session.
 */
function UnansweredListUnavailable() {
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
    <div className="space-y-3 px-4 py-8 md:px-5" role="status">
      <p className="text-sm font-medium text-foreground">
        Cevaplanamayan sorular yüklenemedi.
      </p>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Bağlantı kurulamadı. Tekrar deneyebilirsiniz.
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
