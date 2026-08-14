import type { Route } from "next";
import Link from "next/link";
import { ArrowUpRight, Phone } from "lucide-react";

import type { OrderSummary } from "@/lib/seller/orders";
import {
  getOrderConversationHref,
  getOrderNumberDisplay,
  getPhoneDisplay,
  getProductNameDisplay,
  getReviewNoteDisplay,
  ORDER_OPEN_CONVERSATION_LABEL,
} from "@/lib/seller/orders-format";
import { cn } from "@/lib/utils/cn";

import { PrintContent } from "./print-content";

/**
 * One order in the production worklist — a compact work item, not a
 * spreadsheet line.
 *
 * Information hierarchy (contract-backed only):
 *   1. Sipariş  — external number, or the truthful pending state
 *   2. Ürün     — product_name_snapshot when present (never productId)
 *   3. Baskı    — custom text and/or the Görsel access action
 *   4. Durum    — backend displayStatus + review note when flagged
 *   5. Konuşma  — explicit "Konuşmayı aç" link via the real customerId
 * The phone is quiet secondary metadata next to the conversation link.
 *
 * The row itself is NOT a link: it contains two independent controls
 * (the Görsel action and the conversation link), so wrapping the whole
 * row would nest interactive elements. Seller-review rows keep the
 * restrained terracotta rail and the backend's own review note — no
 * invented urgency, no fake actions.
 */
export function OrderRow({ order }: { order: OrderSummary }) {
  const number = getOrderNumberDisplay(order);
  const productName = getProductNameDisplay(order);
  const phone = getPhoneDisplay(order);
  const reviewNote = getReviewNoteDisplay(order);
  const conversationHref = getOrderConversationHref(order.customerId);
  const needsReview = order.sellerActionRequired;

  return (
    <li className="border-b border-divider last:border-b-0">
      <div
        className={cn(
          "space-y-2.5 px-4 py-3.5 md:px-5",
          needsReview && "border-l-2 border-l-accent pl-[14px] md:pl-[18px]",
        )}
      >
        {/* 1–2. Order identity + product, with the backend state line */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <p
              className={cn(
                "break-words text-[13.5px] font-semibold leading-snug",
                number.isPending
                  ? "font-medium text-muted-foreground"
                  : "text-foreground",
              )}
            >
              {number.isPending ? number.text : `Sipariş ${number.text}`}
            </p>
            {productName !== null ? (
              <p className="mt-0.5 break-words text-[12.5px] leading-snug text-muted-foreground">
                {productName}
              </p>
            ) : null}
          </div>
          <p
            className={cn(
              "shrink-0 text-[11.5px] font-medium leading-snug",
              needsReview ? "text-accent-text" : "text-muted-foreground",
            )}
          >
            {order.displayStatus}
          </p>
        </div>

        {/* Review context — the backend's own note, calm terracotta */}
        {needsReview && reviewNote !== null ? (
          <p className="break-words text-[12px] leading-snug text-accent-text">
            {reviewNote}
          </p>
        ) : null}

        {/* 3. Baskı içeriği */}
        <div>
          <p
            aria-hidden="true"
            className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Baskı içeriği
          </p>
          <PrintContent order={order} />
        </div>

        {/* 4–5. Secondary metadata + explicit conversation action */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 pt-0.5">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] tabular-nums text-muted-foreground">
            <Phone aria-hidden="true" size={12} strokeWidth={1.75} />
            <span className="truncate">{phone}</span>
          </span>
          {conversationHref !== null ? (
            <Link
              href={conversationHref as Route}
              aria-label={
                number.isPending
                  ? `${ORDER_OPEN_CONVERSATION_LABEL} — ${phone}`
                  : `${ORDER_OPEN_CONVERSATION_LABEL} — Sipariş ${number.text}`
              }
              className={cn(
                "inline-flex min-h-11 items-center gap-1 rounded-sm px-1 text-[12.5px] font-medium text-primary-text transition-colors md:min-h-8",
                "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              )}
            >
              <span>{ORDER_OPEN_CONVERSATION_LABEL}</span>
              <ArrowUpRight aria-hidden="true" size={13} strokeWidth={1.75} />
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}
