import type { Route } from "next";
import Link from "next/link";

import type {
  UnansweredQuestionSummary,
  UnansweredView,
} from "@/lib/seller/unanswered";
import {
  formatUnansweredDate,
  getUnansweredOccurrenceCountLabel,
  UNANSWERED_STATUS_DISPLAY,
  unansweredWorkspaceHref,
} from "@/lib/seller/unanswered-format";
import { cn } from "@/lib/utils/cn";

/**
 * One row in the unanswered-question queue.
 *
 * Visual priority (brief contract):
 *   1. canonical question (exact backend text — never rewritten,
 *      never AI-summarized; only visually clamped)
 *   2. occurrence count (“n kez soruldu”)
 *   3. last seen timestamp (localized date)
 *   4. current state line (terracotta only while answering is owed)
 *
 * The whole row is a single real Link — keyboard navigation, focus
 * rings and the selected (`aria-current`) state come for free. The
 * internal group id and the normalized question are never displayed.
 * The backend ordering is preserved by the caller; this component
 * never re-sorts.
 */
export function UnansweredQuestionRow({
  question,
  isSelected,
  view,
}: {
  question: UnansweredQuestionSummary;
  isSelected: boolean;
  /** Current view — threaded into the href so it survives navigation. */
  view: UnansweredView;
}) {
  const statusDisplay = UNANSWERED_STATUS_DISPLAY[question.status];
  const lastSeenLabel = formatUnansweredDate(question.lastSeenAt);
  const countLabel = getUnansweredOccurrenceCountLabel(
    question.occurrenceCount,
  );

  const accessibleParts = [
    question.question,
    countLabel,
    statusDisplay.label,
  ];

  return (
    <li className="border-b border-divider last:border-b-0">
      <Link
        href={
          unansweredWorkspaceHref({
            view,
            questionId: question.id,
          }) as Route
        }
        aria-current={isSelected ? "page" : undefined}
        aria-label={accessibleParts.join(" — ")}
        className={cn(
          "group block px-4 py-3 transition-colors",
          "hover:bg-selected/55 focus-visible:bg-selected/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
          isSelected && "bg-selected",
        )}
      >
        <span
          className={cn(
            "line-clamp-2 break-words text-[13.5px] leading-snug",
            isSelected
              ? "font-semibold text-foreground"
              : "font-medium text-foreground",
          )}
          title={question.question}
        >
          {question.question}
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] leading-snug text-muted-foreground">
          <span className="tabular-nums">{countLabel}</span>
          {lastSeenLabel !== null ? (
            <>
              <span aria-hidden="true">·</span>
              <time
                dateTime={question.lastSeenAt}
                title={`Son görülme · ${lastSeenLabel}`}
                aria-label={`Son görülme · ${lastSeenLabel}`}
                className="tabular-nums"
              >
                Son görülme: {lastSeenLabel}
              </time>
            </>
          ) : null}
        </span>

        <span
          className={cn(
            "mt-1 block text-[11.5px] font-medium leading-none",
            statusDisplay.tone === "accent" && "text-accent-text",
            statusDisplay.tone === "resolved" && "text-primary-text",
            statusDisplay.tone === "muted" && "text-muted-foreground",
          )}
        >
          {statusDisplay.label}
        </span>
      </Link>
    </li>
  );
}
