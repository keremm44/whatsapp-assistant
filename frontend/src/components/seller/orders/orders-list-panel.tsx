"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { OrderListBootstrap } from "@/lib/seller/orders-server";
import { fetchOrderList } from "@/lib/seller/orders-api";
import type { OrderSummary, OrderView } from "@/lib/seller/orders";
import { orderListEmptyCopy } from "@/lib/seller/orders-format";
import { getBrowserAccessToken } from "@/lib/supabase/client";

import { OrderRow } from "./order-row";

/**
 * The production worklist body.
 *
 * Data flow mirrors the Conversations queue: the server page resolves
 * the FIRST page (view + exact search already applied) and passes the
 * parsed bootstrap down; this component only ever fetches FURTHER pages
 * in the browser via the session token. When the bootstrap changes (tab
 * switch, search submit, retry refresh), local pagination state is
 * re-seeded from the new first page — offset resets, stale rows cannot
 * survive, and the backend's ordering is preserved verbatim.
 *
 * Failure discipline: a list failure renders a calm retry surface and
 * never fakes an empty list; load-more failures keep the loaded rows.
 */
export function OrdersListPanel({
  bootstrap,
  view,
  query,
}: {
  bootstrap: OrderListBootstrap;
  view: OrderView;
  query: string | null;
}) {
  const ready = bootstrap.state === "ready" ? bootstrap : null;

  const [rows, setRows] = React.useState<OrderSummary[]>(
    ready?.page.orders ?? [],
  );
  const [total, setTotal] = React.useState(ready?.page.total ?? 0);
  const [nextOffset, setNextOffset] = React.useState(
    ready ? ready.page.offset + ready.page.orders.length : 0,
  );
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [loadMoreError, setLoadMoreError] = React.useState<string | null>(
    null,
  );
  // If the backend returns an empty page while rows.length < total
  // still holds (rows changed between pages), the list end is reached
  // and the footer stops offering "Daha fazla" instead of looping.
  const [endReached, setEndReached] = React.useState(false);
  const inflightRef = React.useRef<AbortController | null>(null);

  // Re-seed from the server payload whenever it changes.
  React.useEffect(() => {
    if (bootstrap.state === "ready") {
      setRows(bootstrap.page.orders);
      setTotal(bootstrap.page.total);
      setNextOffset(bootstrap.page.offset + bootstrap.page.orders.length);
      setLoadMoreError(null);
      setEndReached(false);
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
      const page = await fetchOrderList(accessToken, {
        view,
        externalOrderNumber: query,
        offset: nextOffset,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setRows((previous) => {
        const seen = new Set(previous.map((row) => row.id));
        const fresh = page.orders.filter((row) => !seen.has(row.id));
        return [...previous, ...fresh];
      });
      setTotal(page.total);
      setNextOffset(page.offset + page.orders.length);
      if (page.orders.length === 0) {
        setEndReached(true);
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
    return <ListUnavailable />;
  }

  if (rows.length === 0) {
    const empty = orderListEmptyCopy(view, query !== null);
    return (
      <div className="px-4 py-10 md:px-5" role="status">
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
    <div className="space-y-0">
      <div className="flex items-center justify-end px-4 pb-2 pt-3 md:px-5">
        <span
          className="text-[12px] tabular-nums text-muted-foreground"
          aria-label={`Toplam ${total} sipariş`}
        >
          {rows.length < total ? `${rows.length} / ${total}` : `${total}`}
        </span>
      </div>

      {/* Column titles (desktop scan alignment; rows carry full context) */}
      <div
        aria-hidden="true"
        className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-6 border-t border-divider px-5 pb-2 pt-3 md:grid"
      >
        <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
          Telefon
        </span>
        <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
          Sipariş No
        </span>
        <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
          Baskı içeriği
        </span>
      </div>

      <ul role="list" className="border-t border-divider md:border-t-0">
        {rows.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </ul>

      {(!endReached && rows.length < total) || loadMoreError ? (
        <div className="space-y-2 px-4 py-3 md:px-5">
          {!endReached && rows.length < total ? (
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
 * re-runs the server page (same mechanics as the conversations
 * queue), which re-resolves without touching the auth session.
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
    <div className="space-y-3 px-4 py-10 md:px-5" role="status">
      <p className="text-sm font-medium text-foreground">
        Sipariş bilgileri yüklenemedi.
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
