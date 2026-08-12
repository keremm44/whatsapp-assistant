"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type {
  UnansweredQuestionSummary,
  UnansweredView,
} from "@/lib/seller/unanswered";
import { fetchUnansweredList } from "@/lib/seller/unanswered-api";
import {
  hasAnotherUnansweredPage,
  mergeUnansweredPage,
  UNANSWERED_PAGE_SIZE,
  unansweredListEmptyCopy,
} from "@/lib/seller/unanswered-format";
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
 * the new first page — the offset resets, stale rows cannot survive,
 * and the backend ordering (last_seen_at DESC, id DESC) is preserved
 * verbatim.
 *
 * Pagination contract (inspected backend semantics): `toplam` is the
 * returned page length, not a global count. “Daha fazla göster” is
 * offered only while the backend keeps returning a full
 * UNANSWERED_PAGE_SIZE page; a short or empty page ends the queue.
 * New pages are deduped by group id.
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
    ready?.page.questions ?? [],
  );
  const [nextOffset, setNextOffset] = React.useState(
    ready ? ready.page.offset + ready.page.questions.length : 0,
  );
  const [moreAvailable, setMoreAvailable] = React.useState(
    ready ? hasAnotherUnansweredPage(ready.page.questions.length) : false,
  );
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [loadMoreError, setLoadMoreError] = React.useState<string | null>(
    null,
  );
  const inflightRef = React.useRef<AbortController | null>(null);

  // Re-seed from the server payload whenever it changes.
  React.useEffect(() => {
    if (bootstrap.state === "ready") {
      setRows(bootstrap.page.questions);
      setNextOffset(bootstrap.page.offset + bootstrap.page.questions.length);
      setMoreAvailable(
        hasAnotherUnansweredPage(bootstrap.page.questions.length),
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
      const page = await fetchUnansweredList(accessToken, {
        view,
        limit: UNANSWERED_PAGE_SIZE,
        offset: nextOffset,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setRows((previous) => mergeUnansweredPage(previous, page.questions));
      setNextOffset(page.offset + page.questions.length);
      if (!hasAnotherUnansweredPage(page.questions.length)) {
        setMoreAvailable(false);
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

  if (!ready) {
    return <UnansweredListUnavailable />;
  }

  if (rows.length === 0) {
    const empty = unansweredListEmptyCopy(view);
    return (
      <div className="px-4 py-8 md:px-5" role="status">
        <p className="text-sm font-medium text-foreground">{empty.title}</p>
        {empty.description ? (
          <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
            {empty.description}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
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
