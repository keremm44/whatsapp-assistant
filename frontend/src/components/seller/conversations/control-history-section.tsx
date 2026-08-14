"use client";

import * as React from "react";
import { History } from "lucide-react";

import type { ConversationControlHistoryEntry } from "@/lib/seller/conversations";
import {
  CONTROL_HISTORY_INITIAL_COUNT,
  CONTROL_HISTORY_SHOW_LESS_LABEL,
  CONTROL_HISTORY_SHOW_MORE_LABEL,
  CONTROL_HISTORY_TITLE,
  formatConversationTimestamp,
  getControlHistoryEntryDisplay,
} from "@/lib/seller/conversations-format";
import { cn } from "@/lib/utils/cn";

/**
 * Konuşma geçmişi — a quiet, read-only control-history log inside the
 * conversation context (rail on xl+, Bağlam sheet below; one shared
 * component, no separate implementations).
 *
 * Each entry renders ONLY the seller-facing projection: the state
 * transition ("Asistan aktif → Siz ilgileniyorsunuz"), the calm
 * relative timestamp, and the seller-written reason note when one
 * exists. Technical fields (reasonCode, changedByProfileId, message
 * ids, versions) never render, and no actor identity is fabricated.
 *
 * The list shows the latest 5 entries; when the loaded (bounded)
 * backend collection holds more, a local button expands over the
 * already-loaded data — no extra fetch, no pagination, and no claim
 * of a complete lifetime history.
 */
export function ControlHistorySection({
  entries,
  renderedAt,
}: {
  /** Backend order preserved verbatim (newest first). */
  entries: ConversationControlHistoryEntry[];
  renderedAt: number;
}) {
  const [expanded, setExpanded] = React.useState(false);

  if (entries.length === 0) {
    // No history → no section at all (never a large empty card).
    return null;
  }

  const hasMore = entries.length > CONTROL_HISTORY_INITIAL_COUNT;
  const visible = expanded
    ? entries
    : entries.slice(0, CONTROL_HISTORY_INITIAL_COUNT);

  return (
    <section aria-label={CONTROL_HISTORY_TITLE} className="space-y-2.5 px-4 py-4">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <History aria-hidden="true" size={14} strokeWidth={1.75} />
        <span>{CONTROL_HISTORY_TITLE}</span>
      </h3>
      <ol className="divide-y divide-divider">
        {visible.map((entry) => {
          const display = getControlHistoryEntryDisplay(entry);
          const timePhrase = formatConversationTimestamp(
            entry.createdAt,
            renderedAt,
          );
          return (
            <li key={entry.id} className="space-y-0.5 py-2 first:pt-0 last:pb-0">
              <p className="break-words text-[12.5px] leading-snug text-foreground">
                {display.transition}
              </p>
              {timePhrase ? (
                <time
                  dateTime={entry.createdAt}
                  className="block text-[11px] tabular-nums text-muted-foreground"
                >
                  {timePhrase}
                </time>
              ) : null}
              {display.note !== null ? (
                <p className="whitespace-pre-wrap break-words text-[12px] leading-snug text-muted-foreground">
                  {display.note}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {hasMore ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className={cn(
            "inline-flex min-h-11 items-center rounded-sm px-1 text-[12.5px] font-medium text-muted-foreground transition-colors md:min-h-8",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          )}
        >
          {expanded
            ? CONTROL_HISTORY_SHOW_LESS_LABEL
            : CONTROL_HISTORY_SHOW_MORE_LABEL}
        </button>
      ) : null}
    </section>
  );
}
