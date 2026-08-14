"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import type {
  Product,
  ProductFieldDefinition,
} from "@/lib/seller/products";
import {
  buildUpdateFieldPayload,
  isChoiceFieldType,
  nextFieldSortOrder,
  planFieldMove,
} from "@/lib/seller/products";
import { updateProductField } from "@/lib/seller/products-api";
import {
  classifyProductsMutationFailure,
  FIELD_EMPTY_DESCRIPTION,
  FIELD_EMPTY_TITLE,
  FIELD_REORDER_CONFLICT_MESSAGE,
  FIELD_REORDER_ERROR_MESSAGE,
  FIELD_UNAVAILABLE_DESCRIPTION,
  FIELD_UNAVAILABLE_TITLE,
  fieldMoveDownLabel,
  fieldMoveUpLabel,
  getFieldRequiredLabel,
  getFieldStatusLabel,
  getFieldTypeLabel,
  getProductStatusLabel,
} from "@/lib/seller/products-format";
import type { ProductFieldsBootstrap } from "@/lib/seller/products-server";
import { getBrowserAccessToken } from "@/lib/supabase/client";
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
              nextSortOrder={nextFieldSortOrder(
                fieldsBootstrap.page.definitions,
              )}
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
  return <FieldList definitions={bootstrap.page.definitions} />;
}

/**
 * The custom-field list with quiet up/down ordering.
 *
 * Ordering discipline (backend sort_order contract, no bulk endpoint):
 *   - Adjacency comes from the backend-returned array order
 *     (sort_order ASC, id ASC) — never sortOrder ± 1, so gaps and
 *     legacy values behave correctly.
 *   - One click executes one planFieldMove plan: the normal adjacent
 *     swap is two single-record PATCHes carrying each field's REAL
 *     current version; duplicate/legacy sort values fall back to an
 *     honest renumber plan (see products.planFieldMove).
 *   - Nothing is optimistically reordered: the list keeps rendering
 *     the server bootstrap, and after the writes complete (success OR
 *     failure) router.refresh() re-resolves the backend truth.
 *   - Partial failure honesty: if the second swap PATCH fails, a
 *     best-effort compensating rollback restores writes[0] using the
 *     first PATCH's returned authoritative version; whether or not
 *     the rollback lands, the seller sees calm feedback and the
 *     refreshed backend order — success is never claimed.
 *   - One in-flight operation at a time: every arrow is disabled
 *     while a reorder (or the follow-up refresh) is pending, so rapid
 *     clicks and overlapping swaps are impossible.
 */
function FieldList({
  definitions,
}: {
  definitions: ProductFieldDefinition[];
}) {
  const router = useRouter();
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isReordering, setIsReordering] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const busyRef = React.useRef(false);

  const reorderDisabled = isReordering || isPending;

  const onMove = async (fieldId: number, direction: "up" | "down") => {
    // Synchronous gate: state updates lag a rapid double click.
    if (busyRef.current) return;
    const plan = planFieldMove(definitions, fieldId, direction);
    if (plan.kind === "none") return;

    busyRef.current = true;
    setIsReordering(true);
    setNotice(null);
    let failureNotice: string | null = null;
    try {
      const accessToken = await getBrowserAccessToken();
      if (!accessToken) {
        failureNotice = FIELD_REORDER_ERROR_MESSAGE;
        return;
      }
      if (plan.kind === "swap") {
        const [first, second] = plan.writes;
        // First write; a failure here leaves backend state untouched.
        const firstResult = await updateProductField(
          accessToken,
          first.fieldId,
          buildUpdateFieldPayload({
            version: first.version,
            sortOrder: first.sortOrder,
          }),
        );
        try {
          await updateProductField(
            accessToken,
            second.fieldId,
            buildUpdateFieldPayload({
              version: second.version,
              sortOrder: second.sortOrder,
            }),
          );
        } catch (secondError) {
          // Best-effort compensating rollback of the first write,
          // using the version the backend just returned for it —
          // never a fabricated/stale version. If the rollback itself
          // fails we stop: no further speculative writes; the refresh
          // below surfaces the authoritative state either way.
          try {
            await updateProductField(
              accessToken,
              plan.rollback.fieldId,
              buildUpdateFieldPayload({
                version: firstResult.version,
                sortOrder: plan.rollback.sortOrder,
              }),
            );
          } catch {
            // Swallowed deliberately: the outer handler reports the
            // failure and refreshes backend truth.
          }
          throw secondError;
        }
      } else {
        // Renumber plan (legacy/duplicate sort values): sequential
        // single-record writes with real versions; stop at the first
        // failure — no speculative continuation, no invented
        // compensation across many records.
        for (const write of plan.writes) {
          await updateProductField(
            accessToken,
            write.fieldId,
            buildUpdateFieldPayload({
              version: write.version,
              sortOrder: write.sortOrder,
            }),
          );
        }
      }
    } catch (error) {
      const status = error instanceof ApiError ? error.status : null;
      failureNotice =
        classifyProductsMutationFailure(status) === "conflict"
          ? FIELD_REORDER_CONFLICT_MESSAGE
          : FIELD_REORDER_ERROR_MESSAGE;
    } finally {
      setNotice(failureNotice);
      // Success or failure, the backend list becomes authoritative
      // again; arrows stay disabled until the refresh lands.
      startTransition(() => {
        router.refresh();
      });
      busyRef.current = false;
      setIsReordering(false);
    }
  };

  return (
    <div className="space-y-3">
      {notice !== null ? (
        <p
          role="alert"
          className="text-[12.5px] leading-snug text-destructive"
        >
          {notice}
        </p>
      ) : null}
      <ul className="space-y-3" aria-busy={reorderDisabled}>
        {definitions.map((field, index) => (
          <li key={field.id}>
            <FieldCard
              field={field}
              canMoveUp={index > 0}
              canMoveDown={index < definitions.length - 1}
              reorderDisabled={reorderDisabled}
              onMove={onMove}
            />
          </li>
        ))}
      </ul>
    </div>
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

function FieldCard({
  field,
  canMoveUp,
  canMoveDown,
  reorderDisabled,
  onMove,
}: {
  field: ProductFieldDefinition;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** One reorder at a time: all arrows pause while one is saving. */
  reorderDisabled: boolean;
  onMove: (fieldId: number, direction: "up" | "down") => void;
}) {
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
        <div className="flex flex-wrap items-center gap-2">
          {/* Quiet ordering utility — visually lower priority than the
              field identity and the primary row actions. First/last
              boundaries and the shared in-flight state use native
              disabled; direction is carried by the accessible name,
              never by the icon alone. */}
          <div className="flex items-center gap-1">
            <FieldMoveButton
              direction="up"
              label={fieldMoveUpLabel(field.label)}
              disabled={!canMoveUp || reorderDisabled}
              onClick={() => onMove(field.id, "up")}
            />
            <FieldMoveButton
              direction="down"
              label={fieldMoveDownLabel(field.label)}
              disabled={!canMoveDown || reorderDisabled}
              onClick={() => onMove(field.id, "down")}
            />
          </div>
          <FieldEditDialog field={field} />
          <FieldStatusDialog field={field} />
        </div>
      </div>
    </article>
  );
}

function FieldMoveButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: "up" | "down";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors sm:h-8 sm:w-8",
        "hover:bg-surface-2 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <Icon aria-hidden="true" size={15} strokeWidth={1.75} />
    </button>
  );
}
