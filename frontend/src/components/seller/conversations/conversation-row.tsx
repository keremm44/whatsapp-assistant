import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";

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
 * One row in the conversation queue.
 *
 * Visual contract (V1):
 *   - Line 1: customer identity (name, otherwise the WhatsApp
 *     number) + the LAST-ACTIVITY timestamp. The timestamp is a
 *     quiet relative phrase ("2 saat önce"); it is never labelled
 *     or treated as a waiting time.
 *   - Line 2: one-line latest-message preview. Pure media messages
 *     show a small "Medya mesajı" marker — the read model exposes no
 *     media URL, so no thumbnail is ever fabricated.
 *   - Line 3 (only when the backend marks the row as needing
 *     attention): one small dot + one short presentation label for
 *     the backend's `attention_reason`. Normal conversations stay
 *     visually quiet — no stacked badges.
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
          "group relative block px-4 py-3.5 transition-colors",
          "hover:bg-selected/55 focus-visible:bg-selected/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
          isSelected && "bg-selected",
        )}
      >
        {isSelected ? (
          <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-primary" />
        ) : attentionMeta ? (
          <span aria-hidden="true" className="absolute inset-y-4 left-0 w-0.5 rounded-r-full bg-accent" />
        ) : null}
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0">
            <span
              className={cn(
                "block truncate text-sm leading-snug",
                isSelected
                  ? "font-semibold text-foreground"
                  : "font-medium text-foreground",
              )}
              title={display.primary}
            >
              {display.primary}
            </span>
          </span>
          {timePhrase ? (
            <time
              dateTime={timestampIso ?? undefined}
              title={`Son mesaj · ${timePhrase}`}
              aria-label={`Son mesaj · ${timePhrase}`}
              className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
            >
              {timePhrase}
            </time>
          ) : null}
        </span>

        <span className="mt-0.5 flex items-center gap-1.5 text-xs leading-snug text-muted-foreground">
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

        {attentionMeta ? (
          <span className="mt-1.5 flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                attentionMeta.dotClassName,
              )}
            />
            <span
              className={cn(
                "text-xs font-medium leading-none",
                attentionMeta.textClassName,
              )}
            >
              {attentionMeta.label}
            </span>
          </span>
        ) : null}
      </Link>
    </li>
  );
}
