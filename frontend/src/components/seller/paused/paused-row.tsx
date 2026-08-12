import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Image as ImageIcon } from "lucide-react";

import {
  MEDIA_MESSAGE_LABEL,
  describeMessagePreview,
  formatConversationTimestamp,
  getConversationCustomerDisplay,
} from "@/lib/seller/conversations-format";
import type { ConversationListItem } from "@/lib/seller/conversations";
import {
  PAUSED_OPEN_CONVERSATION_LABEL,
  PAUSED_STATE_LABEL,
  getPausedReasonLabel,
  getPausedReasonNote,
  pausedConversationHref,
} from "@/lib/seller/paused-format";
import { cn } from "@/lib/utils/cn";

/**
 * One recognition row on Yanıtı Durdurulanlar.
 *
 * The whole row is a single Link to the existing Conversations
 * workbench. There is no control mutation, no second click target,
 * and no alert chrome — paused is a slate state, not an error.
 */
export function PausedRow({
  item,
  renderedAt,
}: {
  item: ConversationListItem;
  renderedAt: number;
}) {
  const display = getConversationCustomerDisplay(item.customer);
  const preview = describeMessagePreview(item.lastMessage);
  const timestampIso =
    item.lastMessage?.createdAt ?? item.customer.lastMessageAt;
  const timePhrase = formatConversationTimestamp(timestampIso, renderedAt);
  const reasonLabel = getPausedReasonLabel(item.control?.reasonCode ?? null);
  const reasonNote = getPausedReasonNote(
    item.control?.reasonNote ?? null,
    reasonLabel,
  );
  const href = pausedConversationHref(item.customer.id);

  return (
    <li className="border-b border-divider last:border-b-0">
      <Link
        href={href as Route}
        aria-label={`${display.primary} — ${PAUSED_STATE_LABEL}. ${PAUSED_OPEN_CONVERSATION_LABEL}`}
        className={cn(
          "group block min-h-11 px-4 py-3.5 transition-colors sm:px-5",
          "hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
        )}
      >
        <span className="flex flex-col gap-2 sm:gap-1.5">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span
              className="min-w-0 truncate text-[13.5px] font-medium leading-snug text-foreground"
              title={display.primary}
            >
              {display.primary}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium text-paused">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-paused"
              />
              {PAUSED_STATE_LABEL}
            </span>
          </span>

          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[12.5px] text-muted-foreground">
            {display.secondary ? (
              <span className="min-w-0 truncate">{display.secondary}</span>
            ) : (
              <span />
            )}
            {timePhrase ? (
              <time
                dateTime={timestampIso ?? undefined}
                title={`Son mesaj · ${timePhrase}`}
                aria-label={`Son mesaj · ${timePhrase}`}
                className="shrink-0 text-[11px] tabular-nums"
              >
                {timePhrase}
              </time>
            ) : null}
          </span>

          <span className="flex items-center gap-1.5 text-[12.5px] leading-snug text-muted-foreground">
            {preview.isMedia ? (
              <span className="inline-flex shrink-0 items-center gap-1">
                <ImageIcon
                  aria-hidden="true"
                  size={13}
                  strokeWidth={1.75}
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

          <span className="flex flex-col gap-2 pt-0.5 sm:flex-row sm:items-end sm:justify-between">
            <span className="min-w-0 space-y-0.5">
              {reasonLabel ? (
                <span className="block text-[12px] text-muted-foreground">
                  {reasonLabel}
                </span>
              ) : null}
              {reasonNote ? (
                <span className="block truncate text-[12px] text-muted-foreground/80">
                  {reasonNote}
                </span>
              ) : null}
            </span>
            <span className="inline-flex min-h-11 items-center gap-1 text-[12.5px] font-medium text-primary-text sm:min-h-0">
              <span>{PAUSED_OPEN_CONVERSATION_LABEL}</span>
              <ArrowRight aria-hidden="true" size={13} strokeWidth={1.75} />
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}
