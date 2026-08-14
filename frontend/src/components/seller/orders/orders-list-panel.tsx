"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { OrderListBootstrap } from "@/lib/seller/orders-server";
import { fetchOrderList } from "@/lib/seller/orders-api";
import type { OrderSummary, OrderView } from "@/lib/seller/orders";
import {
  hasAnotherOrdersPage,
  mergeOrdersPage,
  ORDER_PAGE_SIZE,
  orderListEmptyCopy,
} from "@/lib/seller/orders-format";
import { SellerFreshnessNotice } from "@/components/seller/freshness/seller-freshness-banner";
import {
  buildIdVersionSignature,
  signaturesDiffer,
} from "@/lib/seller/freshness";
import {
  cancelInflightLoadMore,
  decideOffsetPageAdvance,
  ownsLoadMoreLifecycle,
} from "@/lib/seller/offset-pagination";
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
 * Pagination contract (inspected backend semantics): `toplam` is the
 * returned page length, not a global count. “Daha fazla göster” is
 * offered while the backend keeps returning a full ORDER_PAGE_SIZE
 * page — a first page of exactly 20 must never hide later work. A
 * short or empty page ends the queue. Duplicate rows caused by live
 * queue movement are deduped by order id; a full page of only
 * duplicates safely advances (capped) instead of getting stuck.
 *
 * Failure discipline: a list failure renders a calm retry surface and
 * never fakes an empty list; load-more failures keep the loaded rows.
 */
export function OrdersListPanel({
  bootstrap,
  view,
  query,
  productId,
  selectedOrderId,
  onSelect,
}: {
  bootstrap: OrderListBootstrap;
  view: OrderView;
  query: string | null;
  /** Backend `product_id` filter — threaded into every page fetch. */
  productId: number | null;
  /** Currently selected order (detail surface); null = none. */
  selectedOrderId: number | null;
  onSelect: (orderId: number) => void;
}) {
  const ready = bootstrap.state === "ready" ? bootstrap : null;

  const [rows, setRows] = React.useState<OrderSummary[]>(
    ready?.page.orders ?? [],
  );
  const [nextOffset, setNextOffset] = React.useState(
    ready ? ready.page.offset + ready.page.orders.length : 0,
  );
  const [moreAvailable, setMoreAvailable] = React.useState(
    ready ? hasAnotherOrdersPage(ready.page.orders.length) : false,
  );
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [loadMoreError, setLoadMoreError] = React.useState<string | null>(
    null,
  );
  const inflightRef = React.useRef<AbortController | null>(null);
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;

  // Re-seed from the server payload whenever it changes (view /
  // search / product filter switches and refreshes all arrive as a
  // new bootstrap).
  React.useEffect(() => {
    // The bootstrap replacing the list context is the stale-request
    // boundary: abort any in-flight load-more NOW so a late response
    // from the OLD context can never append rows, move the offset or
    // set an error against the fresh state, and release the
    // single-in-flight gate + loading flag for the new context.
    cancelInflightLoadMore(inflightRef);
    setIsLoadingMore(false);
    if (bootstrap.state === "ready") {
      setRows(bootstrap.page.orders);
      setNextOffset(bootstrap.page.offset + bootstrap.page.orders.length);
      setMoreAvailable(hasAnotherOrdersPage(bootstrap.page.orders.length));
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
        const page = await fetchOrderList(accessToken, {
          view,
          externalOrderNumber: query,
          productId,
          limit: ORDER_PAGE_SIZE,
          offset,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        const merged = mergeOrdersPage(working, page.orders);
        const appendedCount = merged.length - working.length;
        working = merged;
        setRows(working);

        const decision = decideOffsetPageAdvance({
          incomingCount: page.orders.length,
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
      key={`${view}:${query ?? ""}:${productId ?? ""}`}
      enabled={ready !== null}
      check={async (signal) => {
        const accessToken = await getBrowserAccessToken();
        if (!accessToken) return false;
        const page = await fetchOrderList(accessToken, {
          view,
          externalOrderNumber: query,
          productId,
          limit: ORDER_PAGE_SIZE,
          offset: 0,
          signal,
        });
        return signaturesDiffer(
          buildIdVersionSignature(ready?.page.orders ?? []),
          buildIdVersionSignature(page.orders),
        );
      }}
    />
  );

  if (!ready) {
    return <ListUnavailable />;
  }

  if (rows.length === 0) {
    const empty = orderListEmptyCopy(view, {
      search: query !== null,
      product: productId !== null,
    });
    return (
      <div>
        {freshness}
        <div className="px-4 py-10 md:px-5" role="status">
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
    <div className="space-y-0">
      {freshness}
      <ul role="list">
        {rows.map((order) => (
          <OrderRow
            key={order.id}
            order={order}
            view={view}
            query={query}
            productId={productId}
            isSelected={order.id === selectedOrderId}
            onSelect={onSelect}
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
