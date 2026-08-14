"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import type { OrderView } from "@/lib/seller/orders";
import type { OrderListBootstrap } from "@/lib/seller/orders-server";
import { fetchOrderDetail } from "@/lib/seller/orders-api";
import {
  normalizeOrderSelectionParam,
  ordersListHref,
} from "@/lib/seller/orders-format";
import { getBrowserAccessToken } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

import {
  OrderDetailPanel,
  type OrderDetailPhase,
} from "./order-detail-panel";
import { OrdersListPanel } from "./orders-list-panel";

/**
 * The two-pane Orders workspace: the worklist queue on the left and
 * the selected order's snapshot detail on the right.
 *
 * Selection contract:
 *   - The URL (`?order={id}`) is the source of truth, so refresh /
 *     back / copied links stay exact.
 *   - Selecting a row updates the URL via history.pushState (the App
 *     Router syncs useSearchParams) — NO server round-trip, so list
 *     pagination and scroll survive every selection.
 *   - Filter navigations (view / search / product) go through real
 *     route pushes whose hrefs never carry `order`, so a selection
 *     that may no longer match the new filter is dropped by
 *     construction.
 *
 * Detail data flow (no N+1): `GET /seller/orders/{id}` is fetched for
 * exactly one selected order at a time in the browser. Every
 * selection change aborts the in-flight request, so a slow older
 * response can never overwrite a newer selection. Only the detail
 * region shows loading/error states — the list is never blocked or
 * crashed by a detail failure.
 *
 * Responsive: lg+ renders both regions (~40/60). Below lg exactly one
 * region renders — the queue without a selection, the detail (with an
 * obvious "Listeye dön") with one.
 */
export function OrdersWorkspace({
  bootstrap,
  view,
  query,
  productId,
}: {
  bootstrap: OrderListBootstrap;
  view: OrderView;
  query: string | null;
  productId: number | null;
}) {
  const searchParams = useSearchParams();
  const selectedOrderId = normalizeOrderSelectionParam(
    searchParams.get("order") ?? undefined,
  );

  const [detailState, setDetailState] = React.useState<OrderDetailPhase>({
    phase: "idle",
  });
  const [retryAttempt, setRetryAttempt] = React.useState(0);

  const select = React.useCallback(
    (orderId: number) => {
      window.history.pushState(
        null,
        "",
        ordersListHref({ view, query, productId, orderId }),
      );
    },
    [view, query, productId],
  );

  const clearSelection = React.useCallback(() => {
    window.history.pushState(
      null,
      "",
      ordersListHref({ view, query, productId }),
    );
  }, [view, query, productId]);

  // One in-flight detail request per selection. The cleanup abort is
  // the race guard: changing selection (or unmounting) cancels the
  // previous fetch before its response can land on the new state.
  React.useEffect(() => {
    if (selectedOrderId === null) {
      setDetailState({ phase: "idle" });
      return;
    }
    const controller = new AbortController();
    setDetailState({ phase: "loading" });
    void (async () => {
      try {
        const accessToken = await getBrowserAccessToken();
        if (controller.signal.aborted) return;
        if (!accessToken) {
          setDetailState({ phase: "error" });
          return;
        }
        const detail = await fetchOrderDetail(accessToken, selectedOrderId, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setDetailState({ phase: "ready", detail });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 404) {
          setDetailState({ phase: "not_found" });
          return;
        }
        setDetailState({ phase: "error" });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [selectedOrderId, retryAttempt]);

  const hasSelection = selectedOrderId !== null;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div
        className={cn(
          "min-w-0 lg:border-r lg:border-divider",
          hasSelection && "hidden lg:block",
        )}
      >
        <OrdersListPanel
          bootstrap={bootstrap}
          view={view}
          query={query}
          productId={productId}
          selectedOrderId={selectedOrderId}
          onSelect={select}
        />
      </div>
      <div className={cn("min-w-0", !hasSelection && "hidden lg:block")}>
        <OrderDetailPanel
          state={detailState}
          onRetry={() => setRetryAttempt((value) => value + 1)}
          onBackToList={clearSelection}
        />
      </div>
    </div>
  );
}
