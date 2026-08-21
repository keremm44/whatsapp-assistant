"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type {
  ConversationListBootstrap,
} from "@/lib/seller/conversations-server";
import {
  fetchConversationListV2,
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
  ownsLoadMoreLifecycle,
} from "@/lib/seller/offset-pagination";
import { getBrowserAccessToken } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

import { ConversationRow } from "./conversation-row";

/**
 * Left region of the Conversations workbench: the calm work queue.
 *
 * "The Working Ledger" pilot: the queue sits on RECESSED mineral
 * material so it reads as the index of the correspondence desk, with
 * the paper timeline beside it. The filter control is open underline
 * tab language (not pills), matching the interaction-blue semantics
 * used everywhere else for "active".
 *
 *   Header  — the "Konuşmalar" title and the only two V1 filters,
 *             "Tümü" / "İlgilenmeniz gerekenler", which map 1:1 onto
 *             the backend's `attention_only` parameter. The filters
 *             are plain links, so the filter state lives in the URL
 *             and the server remains the data resolver.
 *   Rows    — backend order preserved verbatim; no client re-ranking.
 *   Footer  — "Daha fazla göster" cursor pagination via the browser
 *             session. Appended pages are deduplicated by customer id
 *             so a row that crossed the cursor boundary between two
 *             pages never appears twice.
 *
 * Pagination contract (GET /seller/conversations/v2, contracts/
 * seller-lists-v2.json): the backend is authoritative — “Daha fazla
 * göster” is offered exactly while `has_more` is true, and each page
 * is fetched with the previous `next_cursor` (signed and bound to
 * this seller + filter set). New pages are APPENDED to the loaded
 * rows; a fixed limit never hides results. The v2 contract carries no
 * global total, so the header figure honestly counts loaded rows.
 *
 * Data flow: the server page resolves the first page and passes the
 * parsed bootstrap down; this component only ever fetches FURTHER
 * pages in the browser. When the server payload changes (filter
 * switch, router.refresh after a control handoff), local pagination
 * state is re-seeded from the new props — extended pages collapse
 * back to the fresh first page (cursor included), which keeps the
 * queue consistent with the backend's ordering after a state change.
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
    ready?.page.items ?? [],
  );
  const [nextCursor, setNextCursor] = React.useState<string | null>(
    ready?.page.nextCursor ?? null,
  );
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [loadMoreError, setLoadMoreError] = React.useState<string | null>(null);
  // The v2 contract is authoritative: "more" exists exactly while
  // has_more is true. A row that crossed the cursor boundary between
  // pages is dropped by the customer-id dedupe instead of duplicated.
  const [moreAvailable, setMoreAvailable] = React.useState(
    ready?.page.hasMore ?? false,
  );
  const inflightRef = React.useRef<AbortController | null>(null);
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;
  const nextCursorRef = React.useRef(nextCursor);
  nextCursorRef.current = nextCursor;

  // Re-seed from the server payload whenever it changes (filter
  // switch via URL, or router.refresh() after a handoff/conflict).
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

      const page = await fetchConversationListV2(accessToken, {
        attentionOnly,
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-4 pb-0 pt-4 md:pt-5">
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="font-heading text-[19px] font-semibold leading-6 text-foreground">
              Konuşmalar
            </h1>
            {ready ? (
              <span
                className="type-meta type-figure text-muted-foreground"
                aria-label={`Yüklenen ${rows.length} konuşma`}
              >
                {rows.length}
              </span>
            ) : null}
          </div>
          {/* Explicit channel identity, kept truthful and un-branded. */}
          <p
            className="flex items-center gap-1.5 type-meta text-muted-foreground"
            aria-label="Kanal: WhatsApp"
          >
            <MessageCircle aria-hidden="true" size={13} strokeWidth={1.75} />
            <span>WhatsApp yazışmaları</span>
          </p>
        </div>

        <nav
          aria-label="Konuşma listesi filtresi"
          className="mt-3 flex gap-4 border-b border-boundary"
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
          const page = await fetchConversationListV2(accessToken, {
            attentionOnly,
            signal,
          });
          return signaturesDiffer(
            buildConversationListFreshnessSignature(
              ready?.page.items ?? [],
            ),
            buildConversationListFreshnessSignature(page.items),
          );
        }}
      />

      {!ready ? (
        <ListUnavailable />
      ) : rows.length === 0 ? (
        <div className="px-4 py-10">
          <p className="type-row-primary text-foreground">
            {attentionOnly
              ? "Şu anda ilgilenmeniz gereken konuşma yok."
              : "Henüz konuşma yok."}
          </p>
          {!attentionOnly ? (
            <p className="mt-1 type-row-secondary text-muted">
              Müşteriler WhatsApp üzerinden yazdığında konuşmalar burada
              listelenir.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="scrollbar-quiet min-h-0 flex-1 md:overflow-y-auto">
            <ul role="list" className="divide-y divide-divider">
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
                <p role="alert" className="text-center type-meta text-destructive">
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
        // Open underline tab language — no pill, no fill. Active is
        // a 2px interaction-blue rule PLUS a weight change, so the
        // state never depends on hue alone, and aria-current carries
        // it to assistive tech.
        "-mb-px flex min-h-11 items-center border-b-2 border-transparent px-0.5 pb-2 pt-1 type-row-secondary transition-colors md:min-h-9",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
        isActive
          ? "border-primary font-semibold text-foreground"
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
      <p className="type-row-primary text-foreground">
        Konuşma listesi şu anda açılamadı
      </p>
      <p className="type-row-secondary text-muted">
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
