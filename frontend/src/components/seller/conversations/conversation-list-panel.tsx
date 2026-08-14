"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type {
  ConversationListBootstrap,
} from "@/lib/seller/conversations-server";
import {
  fetchConversationList,
  type ConversationListItem,
} from "@/lib/seller/conversations";
import { SellerFreshnessNotice } from "@/components/seller/freshness/seller-freshness-banner";
import { conversationsListHref } from "@/lib/seller/conversations-format";
import {
  buildConversationListFreshnessSignature,
  signaturesDiffer,
} from "@/lib/seller/freshness";
import {
  cancelInflightLoadMore,
  decideOffsetPageAdvance,
  ownsLoadMoreLifecycle,
} from "@/lib/seller/offset-pagination";
import { getBrowserAccessToken } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

import { ConversationRow } from "./conversation-row";

/**
 * Left region of the Conversations workbench: the calm work queue.
 *
 *   Header  — the "Konuşmalar" title and the only two V1 filters,
 *             "Tümü" / "İlgilenmeniz gerekenler", which map 1:1 onto
 *             the backend's `attention_only` parameter. The filters
 *             are plain links, so the filter state lives in the URL
 *             and the server remains the data resolver.
 *   Rows    — backend order preserved verbatim; no client re-ranking.
 *   Footer  — "Daha fazla göster" offset pagination via the browser
 *             session. Appended pages are deduplicated by customer id
 *             so a row that shifted position between two offset pages
 *             never appears twice.
 *
 * Data flow: the server page resolves the first page and passes the
 * parsed bootstrap down; this component only ever fetches FURTHER
 * pages in the browser. When the server payload changes (filter
 * switch, router.refresh after a control handoff), local pagination
 * state is re-seeded from the new props — extended pages collapse
 * back to the fresh first page, which keeps the queue consistent
 * with the backend's ordering after a state change.
 */
export function ConversationListPanel({
  bootstrap,
  attentionOnly,
  selectedCustomerId,
}: {
  bootstrap: ConversationListBootstrap;
  attentionOnly: boolean;
  /** Selected conversation on the detail route (desktop highlight). */
  selectedCustomerId: number | null;
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
  const [loadMoreError, setLoadMoreError] = React.useState<string | null>(null);
  // Offset pages walk a live, re-ranked queue. Conversations expose a
  // real global `toplam`, so "more" follows loaded < total; an empty
  // page still ends the queue, and a page of only duplicates advances
  // (capped) instead of getting stuck.
  const [moreAvailable, setMoreAvailable] = React.useState(
    ready ? ready.page.conversations.length < ready.page.total : false,
  );
  const inflightRef = React.useRef<AbortController | null>(null);
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;

  // Re-seed from the server payload whenever it changes (filter
  // switch via URL, or router.refresh() after a handoff/conflict).
  React.useEffect(() => {
    // The bootstrap replacing the list context is the stale-request
    // boundary: abort any in-flight load-more NOW so a late response
    // from the OLD context can never append rows, move the offset or
    // set an error against the fresh state, and release the
    // single-in-flight gate + loading flag for the new context.
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
          attentionOnly,
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="space-y-3 px-4 pb-3 pt-4 md:pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-heading text-[15px] font-semibold text-foreground">
            Konuşmalar
          </h1>
          {ready ? (
            <span
              className="text-[12px] tabular-nums text-muted-foreground"
              aria-label={`Toplam ${total} konuşma`}
            >
              {total}
            </span>
          ) : null}
        </div>

        <nav
          aria-label="Konuşma listesi filtresi"
          className="flex rounded-md border border-border bg-background p-0.5"
        >
          <FilterTab
            href={conversationsListHref(false)}
            label="Tümü"
            isActive={!attentionOnly}
          />
          <FilterTab
            href={conversationsListHref(true)}
            label="İlgilenmeniz gerekenler"
            isActive={attentionOnly}
          />
        </nav>
      </header>

      <SellerFreshnessNotice
        key={attentionOnly ? "attention" : "all"}
        enabled={ready !== null}
        check={async (signal) => {
          const accessToken = await getBrowserAccessToken();
          if (!accessToken) return false;
          const page = await fetchConversationList(accessToken, {
            attentionOnly,
            offset: 0,
            signal,
          });
          return signaturesDiffer(
            buildConversationListFreshnessSignature(
              ready?.page.conversations ?? [],
            ),
            buildConversationListFreshnessSignature(page.conversations),
          );
        }}
      />

      {!ready ? (
        <ListUnavailable />
      ) : rows.length === 0 ? (
        <div className="px-4 py-10">
          <p className="text-sm font-medium text-foreground">
            {attentionOnly
              ? "Şu anda ilgilenmeniz gereken konuşma yok."
              : "Henüz konuşma yok."}
          </p>
          {!attentionOnly ? (
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Müşteriler WhatsApp üzerinden yazdığında konuşmalar burada
              listelenir.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="scrollbar-quiet min-h-0 flex-1 md:overflow-y-auto">
            <ul role="list" className="border-t border-divider">
              {rows.map((item) => (
                <ConversationRow
                  key={item.customer.id}
                  item={item}
                  isSelected={item.customer.id === selectedCustomerId}
                  attentionOnly={attentionOnly}
                  renderedAt={ready.renderedAt}
                />
              ))}
            </ul>
          </div>

          {moreAvailable || loadMoreError ? (
            <div className="space-y-2 px-4 py-3">
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
                <p role="alert" className="text-center text-[12px] text-destructive">
                  {loadMoreError}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function FilterTab({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href as Route}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex min-h-8 flex-1 items-center justify-center rounded-sm px-2 py-1 text-center text-[12.5px] font-medium leading-tight transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isActive
          ? "bg-surface text-foreground shadow-surface"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

/**
 * The queue staying honest when the backend is unavailable: the
 * region never fakes an empty list. The retry re-runs the server
 * page (same mechanics as the shared AccessUnavailable surface),
 * which re-resolves the queue without touching the auth session.
 */
function ListUnavailable() {
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
    <div className="space-y-3 px-4 py-10" role="status">
      <p className="text-sm font-medium text-foreground">
        Konuşma listesi şu anda açılamadı
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
