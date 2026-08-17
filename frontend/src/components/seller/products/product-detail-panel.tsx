"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { useRecordMutationGate } from "@/components/shared/use-record-mutation-gate";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import type {
  Product,
  ProductFieldDefinition,
} from "@/lib/seller/products";
import {
  buildUpdateFieldPayload,
  isChoiceFieldType,
  isFieldMutationLocked,
  nextFieldSortOrder,
  planFieldMove,
  shouldReleaseFieldMutationGate,
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
  getProductStatusTone,
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
  // One shared mutation gate for the selected PRODUCT RECORD: Rename
  // and Status both PATCH the same product.version, so they must
  // never overlap (the sibling stays natively disabled through the
  // mutation AND its authoritative refresh). Scoped to this product
  // only — field mutations keep their own existing lock, and nothing
  // else on the page is affected.
  const productGate = useRecordMutationGate();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-4 border-b border-divider px-4 py-4 md:px-5">
        <div className="space-y-1">
          <h2 className="type-record-identity text-foreground">
            {product.name}
          </h2>
          {/* Business state, not an interaction. Active is the normal
              operating state -> neutral ink; only a disabled product is
              tinted. Label always present. */}
          <p
            className={cn(
              "type-row-secondary font-medium",
              getProductStatusTone(product.isActive) === "paused"
                ? "text-paused"
                : "text-foreground",
            )}
          >
            {getProductStatusLabel(product.isActive)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ProductRenameDialog product={product} gate={productGate} />
          <ProductStatusDialog product={product} gate={productGate} />
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
 *   - One field-definition mutation flow at a time: while a reorder
 *     (or its follow-up authoritative refresh) is pending, every
 *     arrow AND every field Edit / Activate / Deactivate action is
 *     locked (isFieldMutationLocked), so no dialog can issue a PATCH
 *     against the same soon-stale field versions. The synchronous
 *     busy gate is released only after the refresh transition
 *     completes (shouldReleaseFieldMutationGate), closing the window
 *     between PATCH success and the refreshed bootstrap landing.
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

  const mutationLocked = isFieldMutationLocked({
    reorderInFlight: isReordering,
    refreshPending: isPending,
  });

  // The synchronous double-click gate mirrors the FULL lifecycle:
  // it stays engaged through the PATCH sequence (and any rollback)
  // AND the authoritative router.refresh() transition, and is
  // released only when neither is active anymore. Never released
  // inside the request's finally — that would open a window between
  // PATCH success and the refreshed bootstrap landing.
  React.useEffect(() => {
    if (
      shouldReleaseFieldMutationGate({
        reorderInFlight: isReordering,
        refreshPending: isPending,
      })
    ) {
      busyRef.current = false;
    }
  }, [isReordering, isPending]);

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
      // again; the whole field list stays locked until the refresh
      // lands. busyRef is deliberately NOT cleared here — the
      // lifecycle effect releases it once the refresh transition is
      // no longer pending.
      startTransition(() => {
        router.refresh();
      });
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
      {/* One production-specification ledger: fields are separated by
          rules inside a single sheet, never by individual cards. */}
      <ul
        role="list"
        className="divide-y divide-divider overflow-hidden rounded-sheet bg-raised shadow-surface border border-boundary/60"
        aria-busy={mutationLocked}
      >
        {definitions.map((field, index) => (
          <li key={field.id}>
            <FieldRow
              field={field}
              canMoveUp={index > 0}
              canMoveDown={index < definitions.length - 1}
              mutationLocked={mutationLocked}
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

/**
 * One row of the production-specification ledger.
 *
 * Previously each field was its own `rounded-md border bg-surface`
 * card, which made the configuration read as a settings stack. It is
 * now a ruled row inside one sheet: identity first, then a single
 * spec line (type · required · status), then choice options when the
 * backend actually provides them.
 *
 * Ordering controls stay QUIET utilities on the trailing edge. None of
 * the mutation lifecycle changes: the same `mutationLocked` flag, the
 * same disabled boundaries, the same handlers.
 */
function FieldRow({
  field,
  canMoveUp,
  canMoveDown,
  mutationLocked,
  onMove,
}: {
  field: ProductFieldDefinition;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /**
   * One field-definition mutation flow at a time: while a reorder or
   * its authoritative refresh is active, the arrows AND the Edit /
   * Activate / Deactivate actions all pause so no PATCH can be issued
   * against soon-stale field versions.
   */
  mutationLocked: boolean;
  onMove: (fieldId: number, direction: "up" | "down") => void;
}) {
  return (
    <article className="px-4 py-3.5 transition-colors hover:bg-elevated/40 md:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="type-row-primary text-foreground">{field.label}</p>
          <p className="type-row-secondary text-muted-foreground">
            {getFieldTypeLabel(field.fieldType)}
            {" · "}
            {getFieldRequiredLabel(field.isRequired)}
            {" · "}
            {/* Business state, not an interaction. An enabled field is
                the normal case -> neutral ink; only a disabled field is
                tinted (paused slate). */}
            <span
              className={cn(
                "font-medium",
                field.isActive ? "text-foreground" : "text-paused",
              )}
            >
              {getFieldStatusLabel(field.isActive)}
            </span>
          </p>
          {isChoiceFieldType(field.fieldType) && field.options.length > 0 ? (
            <p className="break-words type-row-secondary text-muted">
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
              disabled={!canMoveUp || mutationLocked}
              onClick={() => onMove(field.id, "up")}
            />
            <FieldMoveButton
              direction="down"
              label={fieldMoveDownLabel(field.label)}
              disabled={!canMoveDown || mutationLocked}
              onClick={() => onMove(field.id, "down")}
            />
          </div>
          <FieldEditDialog field={field} disabled={mutationLocked} />
          <FieldStatusDialog field={field} disabled={mutationLocked} />
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
        "inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors sm:h-8 sm:w-8",
        "hover:bg-surface-2 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <Icon aria-hidden="true" size={15} strokeWidth={1.75} />
    </button>
  );
}
