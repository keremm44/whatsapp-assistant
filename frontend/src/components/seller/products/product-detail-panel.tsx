"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type {
  Product,
  ProductFieldDefinition,
} from "@/lib/seller/products";
import { isChoiceFieldType } from "@/lib/seller/products";
import {
  FIELD_EMPTY_DESCRIPTION,
  FIELD_EMPTY_TITLE,
  FIELD_UNAVAILABLE_DESCRIPTION,
  FIELD_UNAVAILABLE_TITLE,
  getFieldRequiredLabel,
  getFieldStatusLabel,
  getFieldTypeLabel,
  getProductStatusLabel,
} from "@/lib/seller/products-format";
import type { ProductFieldsBootstrap } from "@/lib/seller/products-server";
import { cn } from "@/lib/utils/cn";

import { FieldCreateDialog, FieldEditDialog, FieldStatusDialog } from "./field-dialogs";
import { ProductRenameDialog, ProductStatusDialog } from "./product-dialogs";

export function ProductDetailPanel({
  product,
  fieldsBootstrap,
}: {
  product: Product;
  fieldsBootstrap: ProductFieldsBootstrap | null;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-4 border-b border-divider px-4 py-4 md:px-5">
        <div className="space-y-1">
          <h2 className="font-heading text-xl font-medium text-foreground">
            {product.name}
          </h2>
          <p className="text-[12.5px] text-muted-foreground">
            {getProductStatusLabel(product.isActive)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ProductRenameDialog product={product} />
          <ProductStatusDialog product={product} />
        </div>
      </div>
      <div className="space-y-4 px-4 py-4 md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-foreground">
            Bu ürün için toplanacak bilgiler
          </h3>
          {fieldsBootstrap?.state === "ready" ? (
            <FieldCreateDialog
              productId={product.id}
              nextSortOrder={fieldsBootstrap.page.definitions.length}
            />
          ) : null}
        </div>
        <FieldsRegion bootstrap={fieldsBootstrap} />
      </div>
    </div>
  );
}

function FieldsRegion({
  bootstrap,
}: {
  bootstrap: ProductFieldsBootstrap | null;
}) {
  if (bootstrap === null) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Bir ürün seçildiğinde bilgi alanları burada görünür.
      </p>
    );
  }
  if (bootstrap.state !== "ready") {
    return <FieldsUnavailable />;
  }
  if (bootstrap.page.definitions.length === 0) {
    return (
      <EmptyState
        variant="compact"
        title={FIELD_EMPTY_TITLE}
        description={FIELD_EMPTY_DESCRIPTION}
      />
    );
  }
  return (
    <ul className="space-y-3">
      {bootstrap.page.definitions.map((field) => (
        <li key={field.id}>
          <FieldCard field={field} />
        </li>
      ))}
    </ul>
  );
}

function FieldsUnavailable() {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!isPending) setIsRetrying(false);
  }, [isPending]);

  const disabled = isRetrying || isPending;

  return (
    <div className="space-y-3" role="status">
      <p className="text-sm font-medium text-foreground">
        {FIELD_UNAVAILABLE_TITLE}
      </p>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {FIELD_UNAVAILABLE_DESCRIPTION}
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

function FieldCard({ field }: { field: ProductFieldDefinition }) {
  return (
    <article className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">{field.label}</p>
          <p className="text-[12.5px] text-muted-foreground">
            {getFieldTypeLabel(field.fieldType)}
            {" · "}
            {getFieldRequiredLabel(field.isRequired)}
            {" · "}
            <span
              className={cn(
                field.isActive ? "text-primary-text" : "text-muted-foreground",
              )}
            >
              {getFieldStatusLabel(field.isActive)}
            </span>
          </p>
          {isChoiceFieldType(field.fieldType) && field.options.length > 0 ? (
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              {field.options.map((option) => option.label).join(", ")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <FieldEditDialog field={field} />
          <FieldStatusDialog field={field} />
        </div>
      </div>
    </article>
  );
}
