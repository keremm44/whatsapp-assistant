import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";

import { StatusChip } from "@/components/shared/status-chip";
import {
  ATTENTION_REASON_META,
  MEDIA_MESSAGE_LABEL,
  conversationDetailHref,
  describeMessagePreview,
  formatConversationTimestamp,
  getConversationCustomerDisplay,
} from "@/lib/seller/conversations-format";
import type { ConversationListItem } from "@/lib/seller/conversations";
import { cn } from "@/lib/utils/cn";

/**
 * One entry in the correspondence queue.
 *
 * Visual contract (V1 information, Working Ledger presentation):
 *   - Line 1: customer identity — the strongest thing in the row —
 *     plus the LAST-ACTIVITY timestamp, consistently right-aligned
 *     on its own baseline. The timestamp is a quiet relative phrase
 *     ("2 saat önce"); it is never labelled or treated as a waiting
 *     time.
 *   - Line 2: one-line latest-message preview, clearly SECONDARY to
 *     the identity. Pure media messages show a small "Medya mesajı"
 *     marker — the read model exposes no media URL, so no thumbnail
 *     is ever fabricated.
 *   - Line 3 (only when the backend marks the row as needing
 *     attention): a short status flag for the backend's
 *     `attention_reason`. Normal conversations stay visually quiet.
 *
 * Two ORTHOGONAL visual semantics, which must be able to coexist on
 * the same row:
 *
 *   SELECTION  = a NEUTRAL MATERIAL step plus a cyan SIGNAL. The row
 *                lifts to the `selected` graphite material (never a
 *                cyan-filled row — cyan is a signal, not a material),
 *                and carries a 3px cyan structural rail on the
 *                leading edge with brighter, semibold identity text.
 *                Announced with aria-current="page". Never colour
 *                alone: material + rail + weight + aria-current.
 *
 *   ATTENTION  = the backend's own reason, presented as a status
 *                flag line (oxide where the reason genuinely means
 *                seller review — see ATTENTION_REASON_META). Because
 *                it lives in its own line rather than on the row's
 *                leading edge, a selected row that also needs
 *                attention shows BOTH signals without conflict.
 *
 * The whole row is a single real Link so keyboard navigation, focus
 * rings, and open-in-new-tab semantics come for free. The backend
 * ordering is preserved by the caller; this component never re-sorts.
 */
export function ConversationRow({
  item,
  isSelected,
  attentionOnly,
  renderedAt,
}: {
  item: ConversationListItem;
  isSelected: boolean;
  /** Current list filter — threaded into the href so it survives navigation. */
  attentionOnly: boolean;
  /** Frozen "now" for deterministic relative timestamps. */
  renderedAt: number;
}) {
  const display = getConversationCustomerDisplay(item.customer);
  const preview = describeMessagePreview(item.lastMessage);
  const timestampIso =
    item.lastMessage?.createdAt ?? item.customer.lastMessageAt;
  const timePhrase = formatConversationTimestamp(timestampIso, renderedAt);
  const attention = item.needsAttention ? item.attentionReason : null;
  const attentionMeta = attention ? ATTENTION_REASON_META[attention] : null;

  const accessibleParts = [display.primary];
  if (attentionMeta) {
    accessibleParts.push(attentionMeta.label);
  }

  return (
    <li>
      <Link
        href={conversationDetailHref(item.customer.id, attentionOnly) as Route}
        aria-current={isSelected ? "page" : undefined}
        aria-label={accessibleParts.join(" — ")}
        className={cn(
          "group relative block py-3.5 pl-5 pr-4 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
          // Neutral raised material for the selected row; hover is a
          // lighter touch of the same family.
          isSelected
            ? "bg-selected"
            : "hover:bg-raised/70 focus-visible:bg-raised/70",
        )}
      >
        {/* Selection SIGNAL: a thin cyan structural rail. The row
            itself stays neutral material. */}
        {isSelected ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-[3px] bg-primary"
          />
        ) : null}

        <span className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              isSelected
                ? "type-row-primary text-foreground"
                : "type-row-primary font-medium text-foreground",
            )}
            title={display.primary}
          >
            {display.primary}
          </span>
          {timePhrase ? (
            <time
              dateTime={timestampIso ?? undefined}
              title={`Son mesaj · ${timePhrase}`}
              aria-label={`Son mesaj · ${timePhrase}`}
              className="shrink-0 type-meta type-figure text-muted-foreground"
            >
              {timePhrase}
            </time>
          ) : null}
        </span>

        <span className="mt-0.5 flex items-center gap-1.5 type-row-secondary text-muted-foreground">
          {preview.isMedia ? (
            <span className="inline-flex shrink-0 items-center gap-1">
              <ImageIcon
                aria-hidden="true"
                size={13}
                strokeWidth={1.75}
                className="text-muted-foreground"
              />
              <span>{MEDIA_MESSAGE_LABEL}</span>
              {preview.text ? <span aria-hidden="true">·</span> : null}
            </span>
          ) : null}
          {preview.text ? (
            <span className="min-w-0 truncate" title={preview.text}>
              {preview.text}
            </span>
          ) : !preview.isMedia ? (
            <span className="truncate">Henüz mesaj yok</span>
          ) : null}
        </span>

        {/* Attention: the backend's reason as a status chip. Coexists
            with selection because it occupies its own line. Review
            reasons get the coral soft fill; neutral/paused reasons
            keep their own truthful tone. */}
        {attentionMeta ? (
          <StatusChip tone={attentionMeta.chipTone} className="mt-1.5">
            {attentionMeta.label}
          </StatusChip>
        ) : null}
      </Link>
    </li>
  );
}
