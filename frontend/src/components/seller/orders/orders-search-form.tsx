"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Search, X } from "lucide-react";

import {
  ORDER_SEARCH_LABEL,
  ORDER_SEARCH_PLACEHOLDER,
  ordersListHref,
} from "@/lib/seller/orders-format";
import type { OrderView } from "@/lib/seller/orders";

/**
 * Exact marketplace order-number search.
 *
 * Maps 1:1 onto the backend's `external_order_number` filter (equality
 * match; no fuzzy client-side matching anywhere). Submitting (Enter)
 * pushes the search state into the URL — refresh/back navigation stays
 * stable — and keeps the currently selected view. The URL never carries
 * an offset, so a search change resets pagination by construction.
 */
export function OrdersSearchForm({
  view,
  query,
  productId,
}: {
  view: OrderView;
  query: string | null;
  /** Active product filter — preserved across search submits. */
  productId: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(query ?? "");
  const [isPending, startTransition] = React.useTransition();

  // The URL is the source of truth: external changes (browser back,
  // refresh, clear) re-sync the field without a remount, so submit-time
  // focus is never lost.
  React.useEffect(() => {
    setValue(query ?? "");
  }, [query]);

  const submit = (nextValue: string) => {
    const normalized = nextValue.trim();
    if (normalized === (query ?? "")) return;
    startTransition(() => {
      router.push(
        ordersListHref({
          view,
          query: normalized.length > 0 ? normalized : null,
          productId,
        }) as Route,
      );
    });
  };

  return (
    <form
      role="search"
      className="w-full sm:w-64"
      onSubmit={(event) => {
        event.preventDefault();
        submit(value);
      }}
    >
      <label
        htmlFor="orders-search"
        className="mb-1 block text-[12px] font-medium text-muted-foreground"
      >
        {ORDER_SEARCH_LABEL}
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="orders-search"
          name="q"
          type="search"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            // Native "clear search" affordance keeps the current view.
            if (event.key === "Escape" && value.length > 0) {
              event.preventDefault();
              setValue("");
              submit("");
            }
          }}
          maxLength={100}
          placeholder={ORDER_SEARCH_PLACEHOLDER}
          aria-busy={isPending}
          className="h-11 w-full rounded-md border border-border bg-surface pl-9 pr-9 sm:h-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        {value.trim().length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setValue("");
              submit("");
            }}
            aria-label="Aramayı temizle"
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </form>
  );
}
