"use client";

import * as React from "react";
import { Check, ChevronRight, Copy } from "lucide-react";

import type { OrderSummary, OrderView } from "@/lib/seller/orders";
import {
  getCopyableOrderNumber,
  getOrderNumberDisplay,
  getOrderRowReviewReason,
  getPhoneDisplay,
  getPrintContent,
  getProductNameDisplay,
  getRowImageActionLabel,
  getOrderStatusTone,
  getRowImageMessageId,
  ordersListHref,
  ORDER_NUMBER_COPIED_LABEL,
  ORDER_NUMBER_COPY_LABEL,
  runOrderNumberCopy,
  type OrderNumberCopyState,
} from "@/lib/seller/orders-format";
import { StatusChip } from "@/components/shared/status-chip";
import { cn } from "@/lib/utils/cn";

import { OrderImagePreview } from "./order-image-preview";
import { OrderRowThumbnail } from "./order-row-thumbnail";

/** How long the "Kopyalandı" confirmation stays before resetting. */
const COPY_FEEDBACK_MS = 1800;

/**
 * One selectable summary row of the Orders master-detail workspace.
 *
 * ROW INTERACTION ARCHITECTURE
 *
 * The row must stay a single navigable order surface while ALSO
 * offering two nested quick actions (copy number, open image). Nesting
 * a <button> inside an <a> is invalid HTML and breaks keyboard and AT
 * behaviour, so the row uses the "stretched link" pattern instead:
 *
 *   - the <li> is the positioning context;
 *   - the <a> stays in normal flow and keeps ALL of its text content,
 *     so its accessible name is still the natural order/product/
 *     customer/preview context (no synthetic aria-label);
 *   - the <a> paints a transparent `::after` overlay across the whole
 *     row, which is what makes the full row clickable;
 *   - the quick actions are SIBLINGS of the anchor, raised above that
 *     overlay with `relative z-10`.
 *
 * Because the actions are siblings rather than descendants, a click on
 * them can never bubble into the anchor and can never trigger row
 * navigation — there is no anchor ancestor to activate. Their handlers
 * additionally stop propagation as defence in depth. Tab order stays
 * natural: row link → copy → image, each with its own focus ring.
 *
 * Summary hierarchy (list data only — no per-row detail fetch):
 *   1. Sipariş numarası (or the single truthful pending phrase)
 *      + the quiet copy utility when a real number exists
 *   2. backend displayStatus
 *   3. Ürün · telefon (secondary metadata)
 *   4. review reason — the backend's own review note
 *   5. short production preview (text remainder)
 * The image is now carried by a real thumbnail at the row's leading
 * edge rather than a weak text-only marker.
 *
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
  const copyableNumber = getCopyableOrderNumber(order);
  const imageMessageId = getRowImageMessageId(order);
  const productName = getProductNameDisplay(order);
  const phone = getPhoneDisplay(order);
  const content = getPrintContent(order);
  const needsReview = order.sellerActionRequired;
  const statusTone = getOrderStatusTone(order);
  const reviewReason = getOrderRowReviewReason(order);

  const [previewOpen, setPreviewOpen] = React.useState(false);

  const href = ordersListHref({
    view,
    query,
    productId,
    orderId: order.id,
  });

  const metaParts = [productName, phone !== "—" ? phone : null].filter(
    (part): part is string => part !== null,
  );

  // The image now has its own thumbnail, so the inline preview line
  // only carries the remaining production TEXT. Nothing is lost: the
  // image is more prominent than before, not less.
  const previewText =
    content.kind === "text" || content.kind === "image_text"
      ? content.text
      : null;

  return (
    <li
      className={cn(
        "relative border-b border-divider last:border-b-0",
        "transition-colors hover:bg-selected/55",
        isSelected && "bg-selected",
        needsReview && "border-l-2 border-l-accent",
      )}
    >
      <div
        className={cn(
          "flex min-h-11 items-center gap-3 px-4 py-3 md:px-5",
          needsReview && "pl-[14px] md:pl-[18px]",
        )}
      >
        {/* Fixed-width leading slot: rows with and without an image
            keep their order number on the SAME x-axis, so a dense
            queue still scans as one column. */}
        <span className="flex w-12 shrink-0 justify-center md:w-11">
          {imageMessageId !== null ? (
            <OrderImageAction
              imageMessageId={imageMessageId}
              label={getRowImageActionLabel(order)}
              onOpen={() => setPreviewOpen(true)}
            />
          ) : null}
        </span>

        <a
          href={href}
          aria-current={isSelected ? "true" : undefined}
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
            "group min-w-0 flex-1 space-y-1",
            // Stretched link: the transparent overlay is what makes the
            // WHOLE row clickable while the anchor itself stays a
            // normal-flow, text-bearing element.
            "after:absolute after:inset-0 after:content-['']",
            // Keyboard focus must still be obvious. The anchor box only
            // wraps its text, so the RING is drawn on the stretched
            // overlay — the focus indicator then matches the actual
            // click target (the whole row) instead of a partial box.
            "outline-none",
            "focus-visible:after:ring-2 focus-visible:after:ring-inset",
            "focus-visible:after:ring-primary",
          )}
        >
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
            <StatusChip tone={statusTone} className="shrink-0">
              {order.displayStatus}
            </StatusChip>
          </span>

          {metaParts.length > 0 ? (
            <span className="block truncate text-[12.5px] leading-snug text-muted-foreground">
              {metaParts.join(" · ")}
            </span>
          ) : null}

          {/* Why this row needs review — one compact accent line,
              slightly above ordinary metadata, never a warning box. */}
          {reviewReason !== null ? (
            <span className="line-clamp-2 break-words text-[12px] leading-snug text-accent-text">
              {reviewReason}
            </span>
          ) : null}

          {/* Compact production preview; full verbatim content is in
              the detail surface. Nothing repeats the status line. */}
          {previewText !== null ? (
            <span className="flex items-center gap-1.5 text-[12.5px] leading-snug text-muted-foreground">
              <span className="min-w-0 truncate" title={previewText}>
                &ldquo;{previewText}&rdquo;
              </span>
            </span>
          ) : null}
        </a>

        {/* Quick actions: siblings of the anchor, raised above its
            stretched overlay. */}
        {copyableNumber !== null ? (
          <CopyOrderNumberAction value={copyableNumber} />
        ) : null}

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
      </div>

      {/* One dialog instance per row, mounted only when the row truly
          has an addressable image. */}
      {imageMessageId !== null ? (
        <OrderImagePreview
          imageMessageId={imageMessageId}
          orderNumber={order.externalOrderNumber}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      ) : null}
    </li>
  );
}

/**
 * Image quick action. A real <button> (never an anchor-in-anchor) that
 * opens the shared media preview dialog WITHOUT selecting the order.
 *
 * The thumbnail itself is aria-hidden decoration; the button carries
 * the accessible name, so AT users hear one clear "…görselini büyüt"
 * action instead of an unlabelled image.
 */
function OrderImageAction({
  imageMessageId,
  label,
  onOpen,
}: {
  imageMessageId: number;
  label: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        // Defence in depth: the button is not inside the anchor, so it
        // cannot bubble into row navigation — but an ancestor handler
        // must never be able to claim this click either.
        event.stopPropagation();
        onOpen();
      }}
      aria-label={label}
      aria-haspopup="dialog"
      className={cn(
        // Raised above the anchor's stretched overlay.
        "relative z-10 shrink-0 rounded-control",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
      )}
    >
      <OrderRowThumbnail
        imageMessageId={imageMessageId}
        className="transition-opacity hover:opacity-85"
      />
    </button>
  );
}

/**
 * Copy quick action.
 *
 * Renders ONLY when a real marketplace order number exists (the caller
 * gates on `getCopyableOrderNumber`), so a pending row never shows a
 * disabled or fabricated affordance.
 *
 * Feedback is an absolutely positioned `role="status"` confirmation, so
 * it announces to AT, carries real TEXT ("Kopyalandı" — not icon or
 * colour alone), causes zero layout shift in the dense row, and resets
 * itself automatically.
 */
function CopyOrderNumberAction({ value }: { value: string }) {
  const [state, setState] = React.useState<OrderNumberCopyState>("idle");
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const onCopy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const writeText = globalThis.navigator?.clipboard?.writeText;
    const next = await runOrderNumberCopy(value, async (text) => {
      if (typeof writeText !== "function") {
        throw new Error("clipboard_unavailable");
      }
      await writeText.call(globalThis.navigator.clipboard, text);
    });
    setState(next);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), COPY_FEEDBACK_MS);
  };

  return (
    <span className="relative z-10 shrink-0">
      <button
        type="button"
        onClick={onCopy}
        aria-label={`${ORDER_NUMBER_COPY_LABEL}: ${value}`}
        className={cn(
          // 44px touch target on mobile, compact on pointer devices.
          "inline-flex h-11 w-11 items-center justify-center rounded-control md:h-8 md:w-8",
          // Quiet until hover/focus, but never invisible: the icon
          // keeps a discoverable resting tone.
          "text-muted-foreground/70 transition-colors hover:bg-elevated hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
        )}
      >
        {state === "copied" ? (
          <Check aria-hidden="true" size={15} strokeWidth={2} />
        ) : (
          <Copy aria-hidden="true" size={15} strokeWidth={1.75} />
        )}
      </button>

      {/* Live region is always mounted so the announcement is reliable;
          it is positioned out of flow so nothing reflows. */}
      <span
        role="status"
        aria-live="polite"
        className={cn(
          "pointer-events-none absolute right-full top-1/2 z-20 mr-1 -translate-y-1/2 whitespace-nowrap",
          "rounded-control border border-boundary bg-overlay px-1.5 py-0.5",
          "text-[11px] font-medium leading-tight text-foreground",
          state === "idle" && "hidden",
        )}
      >
        {state === "copied"
          ? ORDER_NUMBER_COPIED_LABEL
          : state === "error"
            ? "Kopyalanamadı"
            : ""}
      </span>
    </span>
  );
}
