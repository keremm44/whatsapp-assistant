import * as React from "react";
import { ChevronRight, Image as ImageIcon } from "lucide-react";

import type { OrderSummary, OrderView } from "@/lib/seller/orders";
import {
  getOrderNumberDisplay,
  getPhoneDisplay,
  getPrintContent,
  getProductNameDisplay,
  ordersListHref,
  PRINT_IMAGE_ACTION_LABEL,
} from "@/lib/seller/orders-format";
import { cn } from "@/lib/utils/cn";

/**
 * One selectable summary row of the Orders master-detail workspace.
 *
 * The row is ONE interactive element: a real link whose href is the
 * canonical `?order={id}` URL (middle-click / copy address work), with
 * the click intercepted by the workspace so selection happens without
 * a full server round-trip and without resetting list pagination.
 *
 * Summary hierarchy (list data only — no per-row detail fetch):
 *   1. Sipariş numarası (or the single truthful pending phrase)
 *   2. backend displayStatus
 *   3. Ürün · telefon (secondary metadata)
 *   4. short production preview (image marker + truncated text) —
 *      the full verbatim content lives in the detail surface
 * Selection is communicated by aria-current + the chevron marker +
 * background, never color alone.
 */
export function OrderRow({
  order,
  view,
  query,
  productId,
  isSelected,
  onSelect,
}: {
  order: OrderSummary;
  view: OrderView;
  query: string | null;
  productId: number | null;
  isSelected: boolean;
  onSelect: (orderId: number) => void;
}) {
  const number = getOrderNumberDisplay(order);
  const productName = getProductNameDisplay(order);
  const phone = getPhoneDisplay(order);
  const content = getPrintContent(order);
  const needsReview = order.sellerActionRequired;

  const href = ordersListHref({
    view,
    query,
    productId,
    orderId: order.id,
  });

  const metaParts = [productName, phone !== "—" ? phone : null].filter(
    (part): part is string => part !== null,
  );

  return (
    <li className="border-b border-divider last:border-b-0">
      <a
        href={href}
        aria-current={isSelected ? "true" : undefined}
        aria-label={
          number.isPending
            ? `${number.text} — ${order.displayStatus}`
            : `Sipariş ${number.text} — ${order.displayStatus}`
        }
        onClick={(event) => {
          // Plain left-clicks select in place; modified clicks keep
          // native link behavior (new tab etc.).
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          event.preventDefault();
          onSelect(order.id);
        }}
        className={cn(
          "group flex min-h-11 items-center gap-3 px-4 py-3 transition-colors md:px-5",
          "hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
          isSelected && "bg-surface-2",
          needsReview && "border-l-2 border-l-accent pl-[14px] md:pl-[18px]",
        )}
      >
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span
              className={cn(
                "min-w-0 truncate text-[13.5px] leading-snug",
                number.isPending
                  ? "font-medium text-muted-foreground"
                  : "font-semibold text-foreground",
              )}
            >
              {number.text}
            </span>
            <span
              className={cn(
                "shrink-0 text-[11.5px] font-medium leading-snug",
                needsReview ? "text-accent-text" : "text-muted-foreground",
              )}
            >
              {order.displayStatus}
            </span>
          </span>

          {metaParts.length > 0 ? (
            <span className="block truncate text-[12.5px] leading-snug text-muted-foreground">
              {metaParts.join(" · ")}
            </span>
          ) : null}

          {/* Compact production preview; full verbatim content is in
              the detail surface. Nothing repeats the status line. */}
          {content.kind !== "none" ? (
            <span className="flex items-center gap-1.5 text-[12.5px] leading-snug text-muted-foreground">
              {content.kind === "image" || content.kind === "image_text" ? (
                <span className="inline-flex shrink-0 items-center gap-1">
                  <ImageIcon aria-hidden="true" size={13} strokeWidth={1.75} />
                  <span>{PRINT_IMAGE_ACTION_LABEL}</span>
                  {content.kind === "image_text" ? (
                    <span aria-hidden="true">·</span>
                  ) : null}
                </span>
              ) : null}
              {content.kind === "text" || content.kind === "image_text" ? (
                <span className="min-w-0 truncate" title={content.text}>
                  &ldquo;{content.text}&rdquo;
                </span>
              ) : null}
            </span>
          ) : null}
        </span>

        <ChevronRight
          aria-hidden="true"
          size={15}
          strokeWidth={1.75}
          className={cn(
            "shrink-0 transition-colors",
            isSelected
              ? "text-foreground"
              : "text-muted-foreground/50 group-hover:text-muted-foreground",
          )}
        />
      </a>
    </li>
  );
}
