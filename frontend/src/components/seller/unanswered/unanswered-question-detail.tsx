"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/shared/status-chip";
import { useRecordMutationGate } from "@/components/shared/use-record-mutation-gate";
import type {
  UnansweredAction,
  UnansweredQuestionDetail,
  UnansweredView,
} from "@/lib/seller/unanswered";
import {
  canAnswerUnanswered,
  type UnansweredMutationResolution,
  canDismissUnanswered,
  formatUnansweredTimestamp,
  getUnansweredConversationHref,
  UNANSWERED_ADD_ANSWER_LABEL,
  UNANSWERED_ANSWER_SECTION_TITLE,
  UNANSWERED_EDIT_ANSWER_LABEL,
  UNANSWERED_FUTURE_ONLY_NOTE,
  UNANSWERED_NOT_A_RULE_NOTE,
  UNANSWERED_OCCURRENCES_TITLE,
  UNANSWERED_OPEN_CONVERSATION_LABEL,
  UNANSWERED_SAVE_ANSWER_LABEL,
  UNANSWERED_SAVED_ANSWER_TITLE,
  UNANSWERED_STATUS_DISPLAY,
  UNANSWERED_UPDATE_ANSWER_LABEL,
  unansweredWorkspaceHref,
} from "@/lib/seller/unanswered-format";
import { cn } from "@/lib/utils/cn";

import { UnansweredAnswerEditor } from "./unanswered-answer-editor";
import { UnansweredDismissDialog } from "./unanswered-dismiss-dialog";

/**
 * Selected unanswered-question detail — the right region of the
 * workspace (full-width on mobile, with an obvious list-return
 * affordance).
 *
 * Organized exactly around the page's mental model:
 *   A. Soru                    the canonical question, byte-exact —
 *                              never rewritten or AI-summarized — plus
 *                              factual metadata (count, first/last seen)
 *   B. Müşteriler nasıl sordu? the actual occurrence wordings with
 *                              their timestamps and a genuine
 *                              conversation link when the occurrence
 *                              carries a valid customer id
 *   C. Doğru cevap             OPEN → the answer editor (primary) and
 *                              the restrained dismiss affordance;
 *                              ANSWERED → the saved answer with an
 *                              explicit edit mode; DISMISSED → the
 *                              stored state (+ note) with a “Cevap ekle”
 *                              path back. set_answer is the only way
 *                              forward from DISMISSED — there is no
 *                              invented reopen action.
 *
 * Expectations: text-heavy by design (slightly more editorial than the
 * queues), still fully inside the shared surface language.
 */
export function UnansweredQuestionDetail({
  detail,
  view,
  onMutationSuccess,
}: {
  detail: UnansweredQuestionDetail;
  /** Current view — keeps “Listeye dön” on the same queue. */
  view: UnansweredView;
  /** Called once after a successful set_answer / dismiss. */
  onMutationSuccess: (
    action: UnansweredAction,
  ) => UnansweredMutationResolution;
}) {
  const { question } = detail;
  const statusDisplay = UNANSWERED_STATUS_DISPLAY[question.status];

  // One shared mutation gate for the selected QUESTION RECORD:
  // set_answer and dismiss carry the same expected_version, so they
  // may never overlap. The workspace keys this component per question
  // id, so the gate naturally reseeds on selection change.
  const questionGate = useRecordMutationGate();

  const firstSeenLabel = formatUnansweredTimestamp(question.firstSeenAt);
  const lastSeenLabel = formatUnansweredTimestamp(question.lastSeenAt);
  const answeredLabel = question.answeredAt
    ? formatUnansweredTimestamp(question.answeredAt)
    : null;
  const dismissedLabel = question.dismissedAt
    ? formatUnansweredTimestamp(question.dismissedAt)
    : null;

  const savedAnswer =
    question.answerText !== null && question.answerText.trim().length > 0
      ? question.answerText.trim()
      : null;
  const dismissNote =
    question.dismissNote !== null && question.dismissNote.trim().length > 0
      ? question.dismissNote.trim()
      : null;

  const [answerMode, setAnswerMode] = React.useState<"read" | "edit">(
    "read",
  );

  const mayAnswer = canAnswerUnanswered(question.status);
  const mayDismiss = canDismissUnanswered(question.status);

  const answerForm =
    question.status === "OPEN" ||
    (question.status === "DISMISSED" && answerMode === "edit") ? (
      <UnansweredAnswerEditor
        groupId={question.id}
        version={question.version}
        initialAnswer=""
        submitLabel={UNANSWERED_SAVE_ANSWER_LABEL}
        gate={questionGate}
        onSuccess={() => onMutationSuccess("set_answer")}
        onCancel={
          question.status === "DISMISSED"
            ? () => setAnswerMode("read")
            : undefined
        }
      />
    ) : question.status === "ANSWERED" && answerMode === "edit" ? (
      <UnansweredAnswerEditor
        groupId={question.id}
        version={question.version}
        initialAnswer={savedAnswer ?? ""}
        submitLabel={UNANSWERED_UPDATE_ANSWER_LABEL}
        gate={questionGate}
        onSuccess={() => onMutationSuccess("set_answer")}
        onCancel={() => setAnswerMode("read")}
      />
    ) : null;

  return (
    <div className="flex min-h-0 flex-col">
      {/* Mobile: obvious queue-return affordance, view preserved. */}
      <div className="border-b border-divider px-4 py-2.5 md:px-5 lg:hidden">
        <Link
          href={unansweredWorkspaceHref({ view }) as Route}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          )}
        >
          <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />
          <span>Listeye dön</span>
        </Link>
      </div>

      <div className="space-y-6 px-4 py-5 md:px-5 md:py-6">
        {/* A. Soru */}
        <section aria-labelledby="unanswered-detail-question">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="unanswered-detail-question"
              className="type-meta text-muted-foreground"
            >
              Soru
            </h2>
            <StatusChip tone={statusDisplay.tone} className="shrink-0">
              {statusDisplay.label}
            </StatusChip>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words type-record-identity text-foreground">
            {question.canonicalQuestion}
          </p>
          <dl className="mt-3 space-y-1.5">
            <DetailRow
              label="Sorulma sayısı"
              value={`${question.occurrenceCount} kez`}
            />
            {firstSeenLabel !== null ? (
              <DetailRow label="İlk görülme" value={firstSeenLabel} />
            ) : null}
            {lastSeenLabel !== null ? (
              <DetailRow label="Son görülme" value={lastSeenLabel} />
            ) : null}
            {answeredLabel !== null ? (
              <DetailRow label="Cevap kaydedildi" value={answeredLabel} />
            ) : null}
            {dismissedLabel !== null ? (
              <DetailRow label="Görmezden gelindi" value={dismissedLabel} />
            ) : null}
          </dl>
        </section>

        {/* B. Müşteriler nasıl sordu? */}
        {detail.occurrences.length > 0 ? (
          <section aria-labelledby="unanswered-detail-occurrences">
            <h2
              id="unanswered-detail-occurrences"
              className="type-meta text-muted-foreground"
            >
              {UNANSWERED_OCCURRENCES_TITLE}
            </h2>
            <ul className="mt-2 divide-y divide-divider border-t border-divider">
              {detail.occurrences.map((occurrence) => {
                const occurredLabel = formatUnansweredTimestamp(
                  occurrence.occurredAt,
                );
                const conversationHref = getUnansweredConversationHref(
                  occurrence.customerId,
                );
                return (
                  <li key={occurrence.id} className="space-y-1 py-3">
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                      {occurrence.questionText}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {occurredLabel !== null ? (
                        <time
                          dateTime={occurrence.occurredAt}
                          className="text-[11.5px] type-figure text-muted-foreground"
                        >
                          {occurredLabel}
                        </time>
                      ) : null}
                      {conversationHref !== null ? (
                        <Link
                          href={conversationHref as Route}
                          className="inline-flex min-h-11 items-center gap-1 rounded-md text-[12px] font-medium text-primary-text transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:min-h-0"
                        >
                          <span>{UNANSWERED_OPEN_CONVERSATION_LABEL}</span>
                          <ArrowUpRight
                            aria-hidden="true"
                            size={13}
                            strokeWidth={1.75}
                          />
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* C. Doğru cevap / kayıtlı cevap / dismissed state */}
        {question.status === "OPEN" ? (
          // OPEN belongs to the SAME record-detail language as ANSWERED
          // and DISMISSED: a ruled section, not a bounded form card
          // dropped into the panel. The enclosing sunken slab is gone —
          // the only bounded material left is the textarea itself,
          // which is genuinely a place to type.
          <section
            aria-labelledby="unanswered-detail-answer"
            className="space-y-3 border-t border-divider pt-4"
          >
            <h2
              id="unanswered-detail-answer"
              className="type-row-primary text-foreground"
            >
              {UNANSWERED_ANSWER_SECTION_TITLE}
            </h2>
            {mayAnswer ? answerForm : null}
          </section>
        ) : null}

        {question.status === "ANSWERED" ? (
          // ANSWERED is a saved RECORD, not a form: a ruled section
          // with the answer set as real content. The previous
          // card -> inner answer box nesting is gone.
          <section
            aria-labelledby="unanswered-detail-saved"
            className="space-y-3 border-t border-divider pt-4"
          >
            <h2
              id="unanswered-detail-saved"
              className="type-row-primary text-foreground"
            >
              {UNANSWERED_SAVED_ANSWER_TITLE}
            </h2>
            {answerMode === "edit" ? (
              answerForm
            ) : (
              <>
                {/* The saved answer is the content of this section, so
                    it is set as text with a quiet structural rule —
                    not wrapped in a second box inside the section. */}
                {savedAnswer !== null ? (
                  <p className="whitespace-pre-wrap break-words border-l-2 border-boundary pl-3 type-body text-foreground">
                    {savedAnswer}
                  </p>
                ) : null}
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                  {UNANSWERED_FUTURE_ONLY_NOTE} {UNANSWERED_NOT_A_RULE_NOTE}
                </p>
                {mayAnswer ? (
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setAnswerMode("edit")}
                    >
                      {UNANSWERED_EDIT_ANSWER_LABEL}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {question.status === "DISMISSED" ? (
          // DISMISSED is a quiet state section: a rule, a heading with
          // the truthful paused tone, the note, and the recovery
          // action. No generic card.
          <section
            aria-labelledby="unanswered-detail-dismissed"
            className="space-y-3 border-t border-divider pt-4"
          >
            <h2
              id="unanswered-detail-dismissed"
              className="type-row-primary text-paused"
            >
              {UNANSWERED_STATUS_DISPLAY.DISMISSED.label}
            </h2>
            {answerMode === "edit" ? (
              answerForm
            ) : (
              <>
                {dismissNote !== null ? (
                  <div className="space-y-1">
                    <p className="type-meta text-muted-foreground">Not</p>
                    <p className="whitespace-pre-wrap break-words border-l-2 border-boundary pl-3 type-row-secondary text-foreground">
                      {dismissNote}
                    </p>
                  </div>
                ) : null}
                {mayAnswer ? (
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setAnswerMode("edit")}
                    >
                      {UNANSWERED_ADD_ANSWER_LABEL}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {/* Dismiss — secondary, OPEN only, never competes with save. */}
        {mayDismiss ? (
          <div className="border-t border-divider pt-4">
            <UnansweredDismissDialog
              groupId={question.id}
              version={question.version}
              gate={questionGate}
              onSuccess={() => onMutationSuccess("dismiss")}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-[12.5px] text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-right text-[13px] tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}
