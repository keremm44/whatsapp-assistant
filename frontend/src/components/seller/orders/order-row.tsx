import type { OrderSummary } from "@/lib/seller/orders";
import {
  getOrderNumberDisplay,
  getPhoneDisplay,
  getReviewNoteDisplay,
} from "@/lib/seller/orders-format";
import { cn } from "@/lib/utils/cn";

import { PrintContent } from "./print-content";

/**
 * One order in the production worklist.
 *
 * Desktop: a single scan line with the locked hierarchy
 *   Telefon | Sipariş No | Baskı içeriği   (~25% / ~25% / ~50%)
 * Mobile: the same data stacked as a compact work card with the order
 * number first — never a squeezed desktop table.
 *
 * The row is NOT clickable (there is no detail workflow); the only
 * interactive element is the explicit "Görsel" action inside the
 * print-content area. Seller-review rows get a restrained terracotta
 * rail and the backend's own review note as secondary context — no
 * invented urgency, no fake actions.
 */
export function OrderRow({ order }: { order: OrderSummary }) {
  const phone = getPhoneDisplay(order);
  const number = getOrderNumberDisplay(order);
  const reviewNote = getReviewNoteDisplay(order);
  const needsReview = order.sellerActionRequired;

  return (
    <li className="border-b border-divider last:border-b-0">
      <div
        className={cn(
          "grid gap-x-6 gap-y-2 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] md:items-start md:gap-y-0 md:px-5",
          needsReview && "border-l-2 border-l-accent pl-[14px] md:pl-[18px]",
        )}
      >
        {/* Telefon */}
        <div className="order-2 min-w-0 md:order-1">
          <span className="text-[13.5px] tabular-nums text-foreground">
            {phone}
          </span>
        </div>

        {/* Sipariş No (+ backend-authoritative status line) */}
        <div className="order-1 min-w-0 md:order-2">
          <p
            className={cn(
              "break-words text-[13.5px] font-medium",
              number.isPending ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {number.text}
          </p>
          <p
            className={cn(
              "mt-0.5 text-[12px] leading-snug",
              needsReview ? "text-accent-text" : "text-muted-foreground",
            )}
          >
            {order.displayStatus}
          </p>
          {needsReview && reviewNote !== null ? (
            <p className="mt-1 break-words text-[12px] leading-snug text-accent-text">
              {reviewNote}
            </p>
          ) : null}
        </div>

        {/* Baskı içeriği */}
        <div className="order-3 min-w-0">
          <p
            aria-hidden="true"
            className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:hidden"
          >
            Baskı içeriği
          </p>
          <PrintContent order={order} />
        </div>
      </div>
    </li>
  );
}
