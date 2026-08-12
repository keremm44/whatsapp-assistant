import type { Route } from "next";
import Link from "next/link";

import type { ReturnIssueType, ReturnView } from "@/lib/seller/returns";
import type { ReturnRequestSummary } from "@/lib/seller/returns";
import {
  formatReturnTimestamp,
  getReturnOrderNumberDisplay,
  getReturnPhoneDisplay,
  getReturnReasonExcerpt,
  RETURN_REASON_PENDING_LABEL,
  RETURN_STATUS_DISPLAY,
  returnsWorkspaceHref,
} from "@/lib/seller/returns-format";
import { cn } from "@/lib/utils/cn";

/**
 * One row in the return/issue queue.
 *
 * Visual priority (brief contract):
 *   1. issue type (backend display label, verbatim)
 *   2. short reason excerpt (exact customer text, visually truncated)
 *   3. customer phone (verbatim stored value)
 *   4. external order number snapshot
 *   5. current state line (terracotta only when waiting on the seller)
 *   6. last-updated timestamp (localized date-time, never a
 *      waiting-time claim)
 *
 * The whole row is a single real Link — keyboard navigation, focus
 * rings and the selected (`aria-current`) state come for free. The
 * internal request id is never displayed. The backend ordering is
 * preserved by the caller; this component never re-sorts.
 */
export function ReturnRequestRow({
  request,
  isSelected,
  view,
  query,
  issueType,
}: {
  request: ReturnRequestSummary;
  isSelected: boolean;
  /** Current filter context — threaded into the href so it survives navigation. */
  view: ReturnView;
  query: string | null;
  issueType: ReturnIssueType | null;
}) {
  const reason = getReturnReasonExcerpt(request);
  const phone = getReturnPhoneDisplay(request);
  const orderNumber = getReturnOrderNumberDisplay(request);
  const statusDisplay = RETURN_STATUS_DISPLAY[request.status];
  const updatedLabel = formatReturnTimestamp(request.updatedAt);

  const accessibleParts = [
    request.displayIssueType,
    orderNumber.isPending ? orderNumber.text : `Sipariş ${orderNumber.text}`,
    statusDisplay.label,
  ];

  return (
    <li className="border-b border-divider last:border-b-0">
      <Link
        href={
          returnsWorkspaceHref({
            view,
            query,
            issueType,
            requestId: request.id,
          }) as Route
        }
        aria-current={isSelected ? "page" : undefined}
        aria-label={accessibleParts.join(" — ")}
        className={cn(
          "group block px-4 py-3 transition-colors",
          "hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
          isSelected && "bg-surface-2",
        )}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              "min-w-0 truncate text-[13.5px] leading-snug",
              isSelected
                ? "font-semibold text-foreground"
                : "font-medium text-foreground",
            )}
            title={request.displayIssueType}
          >
            {request.displayIssueType}
          </span>
          {updatedLabel !== null ? (
            <time
              dateTime={request.updatedAt}
              title={`Son güncelleme · ${updatedLabel}`}
              aria-label={`Son güncelleme · ${updatedLabel}`}
              className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
            >
              {updatedLabel}
            </time>
          ) : null}
        </span>

        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">
          {reason !== null ? (
            <span className="line-clamp-2 break-words" title={reason}>
              {reason}
            </span>
          ) : request.status === "COLLECTING" ? (
            <span>{RETURN_REASON_PENDING_LABEL}</span>
          ) : (
            <span aria-hidden="true">—</span>
          )}
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] leading-snug">
          <span
            className={cn(
              "tabular-nums",
              phone.isMissing ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {phone.text}
          </span>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          <span
            className={cn(
              "min-w-0 break-words",
              orderNumber.isPending
                ? "text-muted-foreground"
                : "text-foreground",
            )}
          >
            {orderNumber.text}
          </span>
        </span>

        <span
          className={cn(
            "mt-1 block text-[11.5px] font-medium leading-none",
            statusDisplay.tone === "accent"
              ? "text-accent-text"
              : "text-muted-foreground",
          )}
        >
          {statusDisplay.label}
        </span>
      </Link>
    </li>
  );
}
