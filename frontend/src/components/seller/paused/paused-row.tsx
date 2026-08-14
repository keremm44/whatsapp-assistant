import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  ChevronRight,
  Image as ImageIcon,
  PauseCircle,
  Shield,
  UserX,
} from "lucide-react";

import {
  MEDIA_MESSAGE_LABEL,
  describeMessagePreview,
  formatConversationTimestamp,
  getConversationCustomerDisplay,
} from "@/lib/seller/conversations-format";
import type { ConversationListItem } from "@/lib/seller/conversations";
import {
  PAUSED_OPEN_CONVERSATION_LABEL,
  getPausedReasonNote,
  getPausedReasonPresentation,
  pausedConversationHref,
  type PausedReasonKind,
} from "@/lib/seller/paused-format";
import { cn } from "@/lib/utils/cn";

/**
 * One recognition row on Yanıtı Durdurulanlar — reason first.
 *
 * The page exists to answer "asistan burada neden yanıt vermiyor?",
 * so each row leads with the mapped pause reason (small line icon +
 * label) instead of repeating the page-level "Yanıtlar durduruldu"
 * state on every line. Raw backend reason codes never surface.
 *
 * The whole row stays a single Link to the existing Conversations
 * workbench — the only operational transition; actual control is
 * managed inside the conversation. No nested interactive controls,
 * no alarm chrome (security is a state, not an emergency).
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
  const reason = getPausedReasonPresentation(item.control?.reasonCode ?? null);
  const reasonNote = getPausedReasonNote(
    item.control?.reasonNote ?? null,
    reason.label,
  );
  const href = pausedConversationHref(item.customer.id);

  return (
    <li className="border-b border-divider last:border-b-0">
      <Link
        href={href as Route}
        aria-label={`${display.primary} — ${reason.label}. ${PAUSED_OPEN_CONVERSATION_LABEL}`}
        className={cn(
          "group flex min-h-11 items-start gap-3 px-4 py-3 transition-colors sm:px-5",
          "hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
        )}
      >
        <PausedReasonIcon kind={reason.kind} />

        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span
              className="min-w-0 truncate text-[13.5px] font-medium leading-snug text-foreground"
              title={display.primary}
            >
              {display.primary}
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

          {/* Reason first — the row's actual information. */}
          <span className="block text-[12.5px] font-medium leading-snug text-foreground/90">
            {reason.label}
          </span>
          {reasonNote ? (
            <span className="block truncate text-[12px] leading-snug text-muted-foreground">
              {reasonNote}
            </span>
          ) : null}

          <span className="flex items-center gap-1.5 text-[12.5px] leading-snug text-muted-foreground">
            {preview.isMedia ? (
              <span className="inline-flex shrink-0 items-center gap-1">
                <ImageIcon aria-hidden="true" size={13} strokeWidth={1.75} />
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
        </span>

        {/* The single action, attached to the record. */}
        <span className="inline-flex shrink-0 items-center gap-1 self-center text-[12.5px] font-medium text-primary-text transition-colors group-hover:text-foreground">
          <span className="hidden sm:inline">
            {PAUSED_OPEN_CONVERSATION_LABEL}
          </span>
          <ChevronRight aria-hidden="true" size={15} strokeWidth={1.75} />
        </span>
      </Link>
    </li>
  );
}

/**
 * Restrained reason differentiation: a small muted line icon per
 * mapped category. Deliberately no red/alarm treatment — the design
 * system reserves that for genuine destructive/error surfaces.
 */
function PausedReasonIcon({ kind }: { kind: PausedReasonKind }) {
  const className = "mt-0.5 shrink-0 text-muted-foreground";
  if (kind === "security") {
    return (
      <Shield aria-hidden="true" size={16} strokeWidth={1.75} className={className} />
    );
  }
  if (kind === "violation") {
    return (
      <UserX aria-hidden="true" size={16} strokeWidth={1.75} className={className} />
    );
  }
  return (
    <PauseCircle
      aria-hidden="true"
      size={16}
      strokeWidth={1.75}
      className={className}
    />
  );
}
