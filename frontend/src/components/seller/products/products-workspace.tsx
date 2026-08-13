"use client";

import * as React from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import {
  PRODUCTS_EMPTY_DESCRIPTION,
  PRODUCTS_EMPTY_TITLE,
  PRODUCTS_UNAVAILABLE_DESCRIPTION,
  PRODUCTS_UNAVAILABLE_TITLE,
  productsWorkspaceHref,
  resolveSelectedProduct,
} from "@/lib/seller/products-format";
import type {
  ProductFieldsBootstrap,
  ProductsListBootstrap,
} from "@/lib/seller/products-server";
import { cn } from "@/lib/utils/cn";

import { ProductDetailPanel } from "./product-detail-panel";
import { ProductsListPanel } from "./products-list-panel";

export function ProductsWorkspace({
  listBootstrap,
  fieldsBootstrap,
  requestedProductId,
}: {
  listBootstrap: ProductsListBootstrap;
  fieldsBootstrap: ProductFieldsBootstrap | null;
  requestedProductId: number | null;
}) {
  const router = useRouter();

  if (listBootstrap.state !== "ready") {
    return (
      <WorkspaceRetry
        title={PRODUCTS_UNAVAILABLE_TITLE}
        description={PRODUCTS_UNAVAILABLE_DESCRIPTION}
      />
    );
  }

  const products = listBootstrap.page.products;
  const selected = resolveSelectedProduct(products, requestedProductId);
  const hasSelection = selected !== null;

  const onCreated = (productId: number) => {
    router.push(productsWorkspaceHref(productId) as Route);
    router.refresh();
  };

  if (products.length === 0) {
    return (
      <div className="px-4 py-6 md:px-5">
        <ProductsListPanel
          products={products}
          selectedProductId={null}
          onCreated={onCreated}
        />
      </div>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div
        className={cn(
          "min-w-0 lg:border-r lg:border-divider",
          hasSelection && requestedProductId !== null && "hidden lg:block",
        )}
      >
        <ProductsListPanel
          products={products}
          selectedProductId={selected?.id ?? null}
          onCreated={onCreated}
        />
      </div>
      <div
        className={cn(
          "min-w-0",
          requestedProductId === null && "lg:block",
        )}
      >
        {selected ? (
          <>
            {requestedProductId !== null ? (
              <div className="border-b border-divider px-4 py-2.5 md:px-5 lg:hidden">
                <a
                  href={productsWorkspaceHref() as Route}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground",
                    "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  )}
                >
                  <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />
                  <span>Listeye dön</span>
                </a>
              </div>
            ) : null}
            <ProductDetailPanel
              key={selected.id}
              product={selected}
              fieldsBootstrap={
                selected.id === requestedProductId || requestedProductId === null
                  ? fieldsBootstrap
                  : fieldsBootstrap
              }
            />
          </>
        ) : (
          <EmptyState
            variant="compact"
            className="px-4 md:px-5"
            title={PRODUCTS_EMPTY_TITLE}
            description={PRODUCTS_EMPTY_DESCRIPTION}
          />
        )}
      </div>
    </div>
  );
}

function WorkspaceRetry({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!isPending) setIsRetrying(false);
  }, [isPending]);

  const disabled = isRetrying || isPending;

  return (
    <div className="space-y-3 px-4 py-10 md:px-5" role="status">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
        {description}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        aria-busy={disabled}
        onClick={() => {
          if (disabled) return;
          setIsRetrying(true);
          startTransition(() => {
            router.refresh();
          });
        }}
      >
        Tekrar dene
      </Button>
    </div>
  );
}
