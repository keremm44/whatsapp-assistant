"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Image as ImageIcon, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { OrderDetail, OrderDetailField } from "@/lib/seller/orders";
import {
  formatOrderTimestamp,
  getOrderConversationHref,
  getOrderFieldValueDisplay,
  getOrderNumberDisplay,
  getPhoneDisplay,
  getProductNameDisplay,
  ORDER_DETAIL_CUSTOMER_NOTE_LABEL,
  ORDER_DETAIL_CUSTOMER_TITLE,
  ORDER_DETAIL_EMPTY_GUIDANCE,
  ORDER_DETAIL_LOADING_LABEL,
  ORDER_DETAIL_NOT_FOUND_TITLE,
  ORDER_DETAIL_ORDER_TITLE,
  ORDER_DETAIL_PRINT_TITLE,
  ORDER_DETAIL_PRODUCTION_TITLE,
  ORDER_DETAIL_TIMELINE_TITLE,
  ORDER_DETAIL_UNAVAILABLE_DESCRIPTION,
  ORDER_DETAIL_UNAVAILABLE_TITLE,
  ORDER_FIELD_PENDING_LABEL,
  ORDER_OPEN_CONVERSATION_LABEL,
  PRINT_IMAGE_ACTION_LABEL,
} from "@/lib/seller/orders-format";
import { cn } from "@/lib/utils/cn";

import { OrderImagePreview } from "./order-image-preview";
import { PrintContent } from "./print-content";

/**
 * The selected order's detail surface — the right region of the Orders
 * workspace (full-width on mobile with an obvious list-return
 * affordance).
 *
 * Everything rendered here comes from the real
 * `GET /seller/orders/{order_id}` payload:
 *   A. Header      order number + backend displayStatus + review note
 *   B. Sipariş     number / product snapshot
 *   C. Üretim      dynamic-field snapshots with their collected values
 *                  (`fields[]`) — the seller's own labels, backend
 *                  order preserved; image values open the existing
 *                  media-proxy preview
 *   D. Baskı       core image action + verbatim custom_text
 *   E. Müşteri     phone + verbatim customer note + "Konuşmayı aç"
 *   F. Zaman       factual timestamps
 * No fulfillment/shipping/payment semantics are invented; there are no
 * mutations on this surface.
 */
export type OrderDetailPhase =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; detail: OrderDetail }
  | { phase: "not_found" }
  | { phase: "error" };

export function OrderDetailPanel({
  state,
  onRetry,
  onBackToList,
}: {
  state: OrderDetailPhase;
  /** Re-runs the detail fetch for the current selection. */
  onRetry: () => void;
  /** Mobile-only: clear the selection and return to the queue. */
  onBackToList: () => void;
}) {
  if (state.phase === "idle") {
    // Only visible from lg up: below that the region is hidden while
    // there is no selection, and the queue owns the screen.
    return (
      <div
        className="flex min-h-64 items-center justify-center px-6 py-16"
        role="status"
      >
        <div className="flex max-w-60 flex-col items-center gap-2.5 text-center">
          <Inbox
            aria-hidden="true"
            size={20}
            strokeWidth={1.5}
            className="text-muted-foreground/70"
          />
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {ORDER_DETAIL_EMPTY_GUIDANCE}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      {/* Mobile: obvious queue-return affordance, filters preserved. */}
      <div className="border-b border-divider px-4 py-2.5 md:px-5 lg:hidden">
        <button
          type="button"
          onClick={onBackToList}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          )}
        >
          <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />
          <span>Listeye dön</span>
        </button>
      </div>

      {state.phase === "loading" ? (
        <div
          className="flex min-h-64 items-center justify-center px-6 py-16"
          role="status"
        >
          <Spinner size={18} label={ORDER_DETAIL_LOADING_LABEL} />
        </div>
      ) : null}

      {state.phase === "not_found" ? (
        <div className="space-y-2 px-4 py-10 md:px-5" role="status">
          <p className="text-sm font-medium text-foreground">
            {ORDER_DETAIL_NOT_FOUND_TITLE}
          </p>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Kayıt kaldırılmış veya bağlantı eski olabilir. Listeden başka
            bir sipariş seçebilirsiniz.
          </p>
        </div>
      ) : null}

      {state.phase === "error" ? (
        <div className="space-y-3 px-4 py-10 md:px-5" role="status">
          <p className="text-sm font-medium text-foreground">
            {ORDER_DETAIL_UNAVAILABLE_TITLE}
          </p>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {ORDER_DETAIL_UNAVAILABLE_DESCRIPTION}
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            Tekrar dene
          </Button>
        </div>
      ) : null}

      {state.phase === "ready" ? <OrderDetailBody detail={state.detail} /> : null}
    </div>
  );
}

function OrderDetailBody({ detail }: { detail: OrderDetail }) {
  const { order } = detail;
  const number = getOrderNumberDisplay(order);
  const productName = getProductNameDisplay(order);
  const phone = getPhoneDisplay(order);
  const conversationHref = getOrderConversationHref(order.customerId);
  // Same derivation the backend uses for summaries:
  // has_image := image_message_id is not None.
  const needsReview = order.status === "SELLER_REVIEW_REQUIRED";
  const reviewNote =
    typeof order.reviewReasonNote === "string" &&
    order.reviewReasonNote.trim().length > 0
      ? order.reviewReasonNote.trim()
      : null;
  const customerNote =
    typeof order.customerNote === "string" &&
    order.customerNote.trim().length > 0
      ? order.customerNote
      : null;

  const createdLabel = formatOrderTimestamp(order.createdAt);
  const updatedLabel = formatOrderTimestamp(order.updatedAt);
  const completedLabel = order.completedAt
    ? formatOrderTimestamp(order.completedAt)
    : null;
  const closedLabel = order.closedAt
    ? formatOrderTimestamp(order.closedAt)
    : null;

  return (
    <div className="space-y-6 px-4 py-5 md:px-5 md:py-6">
      {/* A. Header */}
      <section aria-labelledby="order-detail-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="order-detail-heading"
            className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {ORDER_DETAIL_ORDER_TITLE}
          </h2>
          <span
            className={cn(
              "text-[11.5px] font-medium leading-none",
              needsReview ? "text-accent-text" : "text-muted-foreground",
            )}
          >
            {order.displayStatus}
          </span>
        </div>
        <p
          className={cn(
            "mt-2 break-words font-heading text-lg font-medium leading-snug",
            number.isPending ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {number.isPending ? number.text : `Sipariş ${number.text}`}
        </p>
        {productName !== null ? (
          <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">
            {productName}
          </p>
        ) : null}
        {needsReview && reviewNote !== null ? (
          <p className="mt-2 border-l-2 border-l-accent pl-3 text-[12.5px] leading-snug text-accent-text">
            {reviewNote}
          </p>
        ) : null}
      </section>

      {/* C. Üretim bilgileri (dynamic-field snapshot values) */}
      {detail.fields.length > 0 ? (
        <DetailSection title={ORDER_DETAIL_PRODUCTION_TITLE}>
          <dl className="space-y-1.5">
            {detail.fields.map((field) => (
              <ProductionFieldRow
                key={field.id}
                field={field}
                orderStatus={order.status}
                orderNumber={order.externalOrderNumber}
              />
            ))}
          </dl>
        </DetailSection>
      ) : null}

      {/* D. Baskı içeriği (core image + verbatim custom text) */}
      <DetailSection title={ORDER_DETAIL_PRINT_TITLE}>
        <PrintContent
          order={{
            hasImage: order.imageMessageId !== null,
            imageMessageId: order.imageMessageId,
            customText: order.customText,
            externalOrderNumber: order.externalOrderNumber,
            status: order.status,
          }}
        />
      </DetailSection>

      {/* E. Müşteri */}
      <DetailSection title={ORDER_DETAIL_CUSTOMER_TITLE}>
        <dl className="space-y-1.5">
          <DetailRow label="WhatsApp numarası" value={phone} />
        </dl>
        {customerNote !== null ? (
          <div className="space-y-1">
            <p className="text-[12px] font-medium text-muted-foreground">
              {ORDER_DETAIL_CUSTOMER_NOTE_LABEL}
            </p>
            <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
              {customerNote}
            </p>
          </div>
        ) : null}
        {conversationHref !== null ? (
          <Link
            href={conversationHref as Route}
            className={cn(
              "inline-flex min-h-11 items-center gap-1 rounded-sm px-1 text-[12.5px] font-medium text-primary-text transition-colors md:min-h-8",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
          >
            <span>{ORDER_OPEN_CONVERSATION_LABEL}</span>
            <ArrowUpRight aria-hidden="true" size={13} strokeWidth={1.75} />
          </Link>
        ) : null}
      </DetailSection>

      {/* F. Zaman bilgileri */}
      <DetailSection title={ORDER_DETAIL_TIMELINE_TITLE}>
        <dl className="space-y-1.5">
          {createdLabel !== null ? (
            <DetailRow label="Kayıt tarihi" value={createdLabel} />
          ) : null}
          {updatedLabel !== null ? (
            <DetailRow label="Son güncelleme" value={updatedLabel} />
          ) : null}
          {completedLabel !== null ? (
            <DetailRow label="Bilgiler tamamlandı" value={completedLabel} />
          ) : null}
          {closedLabel !== null ? (
            <DetailRow label="Kapatıldı" value={closedLabel} />
          ) : null}
        </dl>
      </DetailSection>
    </div>
  );
}

/**
 * One production line: the seller's own field label with the
 * collected snapshot value. Both sides are seller-defined content of
 * unbounded length, so the composition is wrap-safe by construction:
 * narrow viewports stack label above value; from sm up the compact
 * two-sided "Label — Value" line returns, with both sides allowed to
 * wrap (no rigid shrink-0 — a long label can never squeeze the value
 * out of the viewport, and nothing is truncated). Image values open
 * the existing authenticated media-proxy preview; a not-yet-collected
 * value shows the single waiting phrase only while the order is
 * truthfully still COLLECTING.
 */
function ProductionFieldRow({
  field,
  orderStatus,
  orderNumber,
}: {
  field: OrderDetailField;
  orderStatus: OrderDetail["order"]["status"];
  orderNumber: string | null;
}) {
  const display = getOrderFieldValueDisplay(field);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  return (
    <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="min-w-0 break-words text-[12.5px] text-muted-foreground">
        {field.label}
      </dt>
      <dd className="min-w-0 break-words text-[13px] sm:text-right">
        {display.kind === "text" ? (
          <span className="whitespace-pre-wrap text-foreground">
            {display.text}
          </span>
        ) : null}
        {display.kind === "image" ? (
          <>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              aria-label={`${field.label} görselini aç`}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-sm px-1 text-[13px] font-medium text-primary-text transition-colors sm:min-h-6",
                "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              )}
            >
              <ImageIcon aria-hidden="true" className="h-4 w-4" />
              <span>{PRINT_IMAGE_ACTION_LABEL}</span>
            </button>
            <OrderImagePreview
              imageMessageId={display.messageId}
              orderNumber={orderNumber}
              open={previewOpen}
              onOpenChange={setPreviewOpen}
            />
          </>
        ) : null}
        {display.kind === "pending" ? (
          <span className="text-muted-foreground">
            {orderStatus === "COLLECTING" ? ORDER_FIELD_PENDING_LABEL : "—"}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 border-t border-divider pt-4">
      <h2 className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-[13px] tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}
