"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ReturnListBootstrap } from "@/lib/seller/returns-server";
import { fetchReturnList } from "@/lib/seller/returns-api";
import type {
  ReturnIssueType,
  ReturnRequestSummary,
  ReturnView,
} from "@/lib/seller/returns";
import {
  hasAnotherReturnsPage,
  mergeReturnsPage,
  RETURN_PAGE_SIZE,
  returnListEmptyCopy,
} from "@/lib/seller/returns-format";
import { SellerFreshnessNotice } from "@/components/seller/freshness/seller-freshness-banner";
import {
  buildIdVersionSignature,
  signaturesDiffer,
} from "@/lib/seller/freshness";
import { decideOffsetPageAdvance } from "@/lib/seller/offset-pagination";
import { getBrowserAccessToken } from "@/lib/supabase/client";

import { ReturnRequestRow } from "./return-request-row";

/**
 * The return/issue queue body.
 *
 * Data flow mirrors the Orders/Conversations queues: the server page
 * resolves the FIRST page (view + exact search + type already applied)
 * and passes the parsed bootstrap down; this component only ever
 * fetches FURTHER pages in the browser via the session token. When the
 * bootstrap changes (tab switch, search/type change, retry refresh),
 * local pagination state is re-seeded from the new first page — the
 * offset resets, stale rows cannot survive, and the backend ordering
 * is preserved verbatim.
 *
 * Pagination contract: the backend `toplam` is a page length, not a
 * global count. “Daha fazla göster” is offered only while the backend
 * keeps returning a full RETURN_PAGE_SIZE page; a short or empty page
 * ends the queue. New pages are deduped by request id.
 *
 * Failure discipline: an initial list failure renders a calm retry
 * surface and never fakes an empty list; load-more failures keep the
 * already-loaded rows.
 */
export function ReturnsListPanel({
  bootstrap,
  view,
  query,
  issueType,
  selectedRequestId,
}: {
  bootstrap: ReturnListBootstrap;
  view: ReturnView;
  query: string | null;
  issueType: ReturnIssueType | null;
  selectedRequestId: number | null;
}) {
  const ready = bootstrap.state === "ready" ? bootstrap : null;

  const [rows, setRows] = React.useState<ReturnRequestSummary[]>(
    ready?.page.requests ?? [],
  );
  const [nextOffset, setNextOffset] = React.useState(
    ready ? ready.page.offset + ready.page.requests.length : 0,
  );
  const [moreAvailable, setMoreAvailable] = React.useState(
    ready ? hasAnotherReturnsPage(ready.page.requests.length) : false,
  );
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [loadMoreError, setLoadMoreError] = React.useState<string | null>(
    null,
  );
  const inflightRef = React.useRef<AbortController | null>(null);
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;

  // Re-seed from the server payload whenever it changes.
  React.useEffect(() => {
    if (bootstrap.state === "ready") {
      setRows(bootstrap.page.requests);
      setNextOffset(bootstrap.page.offset + bootstrap.page.requests.length);
      setMoreAvailable(
        hasAnotherReturnsPage(bootstrap.page.requests.length),
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

      while (true) {
        const page = await fetchReturnList(accessToken, {
          view,
          externalOrderNumber: query,
          issueType,
          limit: RETURN_PAGE_SIZE,
          offset,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        const merged = mergeReturnsPage(working, page.requests);
        const appendedCount = merged.length - working.length;
        working = merged;
        setRows(working);

        const decision = decideOffsetPageAdvance({
          incomingCount: page.requests.length,
          appendedCount,
          incomingOffset: page.offset,
          pageSize: page.limit,
          autoContinueCount: autoContinues,
          moreRule: { kind: "page_size" },
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
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      setIsLoadingMore(false);
    }
  };

  const freshness = (
    <SellerFreshnessNotice
      key={`${view}:${query ?? ""}:${issueType ?? ""}`}
      enabled={ready !== null}
      check={async (signal) => {
        const accessToken = await getBrowserAccessToken();
        if (!accessToken) return false;
        const page = await fetchReturnList(accessToken, {
          view,
          externalOrderNumber: query,
          issueType,
          limit: RETURN_PAGE_SIZE,
          offset: 0,
          signal,
        });
        return signaturesDiffer(
          buildIdVersionSignature(ready?.page.requests ?? []),
          buildIdVersionSignature(page.requests),
        );
      }}
    />
  );

  if (!ready) {
    return <ReturnListUnavailable />;
  }

  if (rows.length === 0) {
    const empty = returnListEmptyCopy(
      view,
      query !== null || issueType !== null,
    );
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
      <ul role="list" aria-label="İade ve sorun kayıtları">
        {rows.map((request) => (
          <ReturnRequestRow
            key={request.id}
            request={request}
            isSelected={request.id === selectedRequestId}
            view={view}
            query={query}
            issueType={issueType}
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
 * Honest failure surface: the list never fakes emptiness. The retry
 * re-runs the server page (same mechanics as the other queues), which
 * re-resolves without touching the auth session.
 */
function ReturnListUnavailable() {
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
        İade ve sorun kayıtları yüklenemedi.
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
