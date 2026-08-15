"use client";

import type { Route } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import type { Product } from "@/lib/seller/products";
import {
  getProductStatusLabel,
  getProductStatusTone,
  PRODUCTS_EMPTY_DESCRIPTION,
  PRODUCTS_EMPTY_TITLE,
  productsWorkspaceHref,
} from "@/lib/seller/products-format";
import { cn } from "@/lib/utils/cn";

import { ProductCreateDialog } from "./product-dialogs";

export function ProductsListPanel({
  products,
  selectedProductId,
  onCreated,
}: {
  products: readonly Product[];
  selectedProductId: number | null;
  onCreated: (productId: number) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-divider px-4 py-3 md:px-5">
        <p className="text-sm font-medium text-foreground">Ürünler</p>
        <ProductCreateDialog onCreated={onCreated} />
      </div>
      {products.length === 0 ? (
        <div className="px-4 py-6 md:px-5">
          <EmptyState
            variant="compact"
            title={PRODUCTS_EMPTY_TITLE}
            description={PRODUCTS_EMPTY_DESCRIPTION}
          />
          <div className="mt-4">
            <ProductCreateDialog onCreated={onCreated} />
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-divider">
          {products.map((product) => {
            const selected = product.id === selectedProductId;
            return (
              <li key={product.id}>
                <Link
                  href={productsWorkspaceHref(product.id) as Route}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center justify-between gap-3 px-4 py-3 transition-colors md:px-5",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                    selected
                      ? "bg-selected text-foreground"
                      : "text-foreground hover:bg-elevated/40",
                  )}
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {product.name}
                  </span>
                  {/* Business state, not an interaction. Active is the
                      normal operating state -> neutral ink; only
                      "Devre dışı" is tinted (paused slate). Success
                      green stays reserved for completed states, and
                      cyan for selection / focus / links. The label
                      always renders, so the state never depends on
                      colour alone. */}
                  <span
                    className={cn(
                      "shrink-0 text-[12px] font-medium",
                      getProductStatusTone(product.isActive) === "paused"
                        ? "text-paused"
                        : "text-foreground",
                    )}
                  >
                    {getProductStatusLabel(product.isActive)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
