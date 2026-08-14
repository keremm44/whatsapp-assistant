"use client";

import * as React from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import type { Product } from "@/lib/seller/products";
import type { ProductsListBootstrap } from "@/lib/seller/products-server";
import type { OrderView } from "@/lib/seller/orders";
import {
  ORDER_PRODUCT_FILTER_ACTIVE_FALLBACK_LABEL,
  ORDER_PRODUCT_FILTER_ALL_LABEL,
  ORDER_PRODUCT_FILTER_LABEL,
  ordersListHref,
} from "@/lib/seller/orders-format";

/**
 * Product filter for the Orders worklist — a direct binding of the
 * backend's existing `product_id` list filter.
 *
 * Options come from the real product contract (`GET /seller/products`,
 * resolved server-side with inactive products included, since orders
 * may reference products that were later deactivated). No fake
 * options are ever fabricated.
 *
 * The URL owns the state: choosing a product pushes the filtered
 * route (selection dropped by construction), "Tüm ürünler" clears the
 * filter. If the product list could not be loaded while a filter is
 * active in the URL, the select still renders a truthful placeholder
 * option so the filter stays visible and removable.
 */
export function OrdersProductFilter({
  bootstrap,
  view,
  query,
  productId,
}: {
  bootstrap: ProductsListBootstrap;
  view: OrderView;
  query: string | null;
  productId: number | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const products: Product[] =
    bootstrap.state === "ready" ? bootstrap.page.products : [];

  // Nothing to filter by and nothing to clear: render no control at
  // all instead of an empty dropdown.
  if (products.length === 0 && productId === null) {
    return null;
  }

  const knownSelection =
    productId !== null &&
    products.some((product) => product.id === productId);

  const onChange = (value: string) => {
    const nextProductId =
      value === "" ? null : Number.parseInt(value, 10) || null;
    if (nextProductId === productId) return;
    startTransition(() => {
      router.push(
        ordersListHref({ view, query, productId: nextProductId }) as Route,
      );
    });
  };

  return (
    <div className="w-full sm:w-56">
      <label
        htmlFor="orders-product-filter"
        className="mb-1 block text-[12px] font-medium text-muted-foreground"
      >
        {ORDER_PRODUCT_FILTER_LABEL}
      </label>
      <select
        id="orders-product-filter"
        value={productId !== null ? String(productId) : ""}
        onChange={(event) => onChange(event.target.value)}
        aria-busy={isPending}
        className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <option value="">{ORDER_PRODUCT_FILTER_ALL_LABEL}</option>
        {productId !== null && !knownSelection ? (
          // Active filter whose product could not be resolved right
          // now (product list unavailable): keep it visible and
          // clearable without exposing a raw internal id.
          <option value={String(productId)}>
            {ORDER_PRODUCT_FILTER_ACTIVE_FALLBACK_LABEL}
          </option>
        ) : null}
        {products.map((product) => (
          <option key={product.id} value={String(product.id)}>
            {product.name}
          </option>
        ))}
      </select>
    </div>
  );
}
