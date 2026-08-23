"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ConversationListBootstrap } from "@/lib/seller/conversations-server";
import {
  fetchConversationListV2,
  type ConversationListItem,
} from "@/lib/seller/conversations";
import { conversationsListHref } from "@/lib/seller/conversations-format";
import {
  cancelInflightLoadMore,
  ownsLoadMoreLifecycle,
} from "@/lib/seller/offset-pagination";
import {
  getBrowserAccessToken,
  subscribeToMessageInserts,
} from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

import { ConversationRow } from "./conversation-row";

export function ConversationListPanel({
  bootstrap,
  attentionOnly,
  selectedCustomerId,
}: {
  bootstrap: ConversationListBootstrap;
  attentionOnly: boolean;
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
  const [moreAvailable, setMoreAvailable] = React.useState(
    ready?.page.hasMore ?? false,
  );

  const inflightRef = React.useRef<AbortController | null>(null);
  const realtimeInflightRef = React.useRef<AbortController | null>(null);
  const realtimePendingRef = React.useRef(false);
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;
  const nextCursorRef = React.useRef(nextCursor);
  nextCursorRef.current = nextCursor;

  React.useEffect(() => {
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
      realtimeInflightRef.current?.abort();
    };
  }, []);

  React.useEffect(() => {
    if (ready === null) return;
    let active = true;

    const refreshList = async (): Promise<void> => {
      if (!active) return;
      if (realtimeInflightRef.current !== null) {
        realtimePendingRef.current = true;
        return;
      }

      const controller = new AbortController();
      realtimeInflightRef.current = controller;
      try {
        const accessToken = await getBrowserAccessToken();
        if (!active || controller.signal.aborted || !accessToken) return;

        const page = await fetchConversationListV2(accessToken, {
          attentionOnly,
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted) return;

        cancelInflightLoadMore(inflightRef);
        setIsLoadingMore(false);
        setRows(page.items);
        setNextCursor(page.nextCursor);
        setMoreAvailable(page.hasMore);
        setLoadMoreError(null);
      } catch {
        // Keep the last valid list on a transient realtime refresh failure.
      } finally {
        if (realtimeInflightRef.current === controller) {
          realtimeInflightRef.current = null;
        }
        if (active && realtimePendingRef.current) {
          realtimePendingRef.current = false;
          void refreshList();
        }
      }
    };

    const unsubscribe = subscribeToMessageInserts(() => {
      void refreshList();
    });

    return () => {
      active = false;
      realtimePendingRef.current = false;
      realtimeInflightRef.current?.abort();
      realtimeInflightRef.current = null;
      unsubscribe();
    };
  }, [attentionOnly, ready]);

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
        setMoreAvailable(false);
        return;
      }

      const page = await fetchConversationListV2(accessToken, {
        attentionOnly,
        cursor,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

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
