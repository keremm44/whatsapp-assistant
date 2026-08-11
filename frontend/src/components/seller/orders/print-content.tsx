"use client";

import * as React from "react";
import { Image as ImageIcon } from "lucide-react";

import type { OrderSummary } from "@/lib/seller/orders";
import {
  getPrintContent,
  PRINT_CONTENT_PENDING_LABEL,
  PRINT_IMAGE_ACTION_LABEL,
} from "@/lib/seller/orders-format";

import { OrderImagePreview } from "./order-image-preview";

/**
 * "Baskı içeriği" — the single source area answering "Bu siparişte ne
 * basacağım?".
 *
 * Exactly four presentations (see getPrintContent):
 *   image        → [Görsel] action
 *   text         → the exact stored custom_text, quoted
 *   image + text → [Görsel] action + quoted text in one area
 *   none         → "Henüz alınmadı" (presentation fallback, not a state)
 *
 * custom_text is production-critical: it renders verbatim (React
 * escaping + whitespace-pre-wrap), never trimmed, summarized or
 * clamped away behind a detail page.
 */
export function PrintContent({
  order,
}: {
  order: Pick<
    OrderSummary,
    | "hasImage"
    | "imageMessageId"
    | "customText"
    | "externalOrderNumber"
  >;
}) {
  const content = getPrintContent(order);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  const imageAction =
    content.kind === "image" || content.kind === "image_text" ? (
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        aria-label={
          order.externalOrderNumber
            ? `Sipariş ${order.externalOrderNumber} baskı görselini aç`
            : "Baskı görselini aç"
        }
        className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-1 text-[13px] font-medium text-primary-text transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:min-h-8"
      >
        <ImageIcon className="h-4 w-4" aria-hidden="true" />
        <span>{PRINT_IMAGE_ACTION_LABEL}</span>
      </button>
    ) : null;

  return (
    <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1.5">
      {content.kind === "none" ? (
        <span className="text-[13.5px] text-muted-foreground">
          {PRINT_CONTENT_PENDING_LABEL}
        </span>
      ) : null}

      {imageAction}

      {content.kind === "image_text" ? (
        <span
          aria-hidden="true"
          className="self-center text-[13px] text-muted-foreground"
        >
          +
        </span>
      ) : null}

      {content.kind === "text" || content.kind === "image_text" ? (
        <PrintText text={content.text} />
      ) : null}

      {imageAction ? (
        <OrderImagePreview
          imageMessageId={
            content.kind === "image" || content.kind === "image_text"
              ? content.imageMessageId
              : 0
          }
          orderNumber={order.externalOrderNumber}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      ) : null}
    </div>
  );
}

/**
 * Exact stored print text, visually quoted. Full text always wrapped —
 * never truncated into a destructive ellipsis.
 */
function PrintText({ text }: { text: string }) {
  return (
    <span className="min-w-0 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-foreground">
      &ldquo;{text}&rdquo;
    </span>
  );
}
