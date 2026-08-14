"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { RecordMutationGate } from "@/components/shared/use-record-mutation-gate";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import { postUnansweredAction } from "@/lib/seller/unanswered-api";
import {
  buildSetAnswerPayload,
  classifyUnansweredMutationFailure,
  gateModeForUnansweredSuccess,
  type UnansweredMutationResolution,
  UNANSWERED_ANSWER_LABEL,
  UNANSWERED_ANSWER_MAX_LENGTH,
  UNANSWERED_FUTURE_ONLY_NOTE,
  UNANSWERED_NOT_A_RULE_NOTE,
} from "@/lib/seller/unanswered-format";
import { getBrowserAccessToken } from "@/lib/supabase/client";

/**
 * The seller-authored answer form — the page's primary action wherever
 * an answer may be saved (OPEN, and “Cevap ekle” on DISMISSED; the
 * ANSWERED edit mode reuses it with a prefilled draft).
 *
 * Semantics discipline:
 *   - the future-only note is plain visible text near the form —
 *     never a tooltip, never an AI-training claim;
 *   - the payload always carries the expected_version the seller is
 *     looking at; nothing is optimistic-faked before the backend
 *     answers;
 *   - 409: keep the draft, re-resolve truth, explain calmly. 422:
 *     calm validation feedback, draft kept. transient: draft kept,
 *     retry allowed. Raw backend internals never surface.
 */
export function UnansweredAnswerEditor({
  groupId,
  version,
  initialAnswer,
  submitLabel,
  gate,
  onSuccess,
  onCancel,
}: {
  groupId: number;
  /** The version rendered to the seller — sent as expected_version. */
  version: number;
  /** Prefill for the ANSWERED edit mode; empty for a fresh answer. */
  initialAnswer: string;
  submitLabel: string;
  /**
   * Shared question-record mutation gate: set_answer and dismiss use
   * the same expected_version, so they may never overlap. While the
   * sibling owns the gate, this submit is disabled and fails closed.
   */
  gate: RecordMutationGate;
  /**
   * Called once after a successful set_answer. The workspace performs
   * ONLY the clear-selection navigation and returns the business
   * resolution; the gate lifecycle here follows it (refresh success
   * is gate-owned; clear-selection leaves the gate engaged until the
   * keyed detail unmounts with the navigation).
   */
  onSuccess: () => UnansweredMutationResolution;
  /** Optional “Vazgeç” affordance for the ANSWERED edit mode. */
  onCancel?: () => void;
}) {
  const [answer, setAnswer] = React.useState(initialAnswer);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [wasConflict, setWasConflict] = React.useState(false);
  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      inflightRef.current?.abort();
    };
  }, []);

  const trimmedLength = answer.trim().length;
  const canSubmit = trimmedLength > 0 && !isSubmitting && !gate.locked;

  const onSubmit = async () => {
    if (!canSubmit || inflightRef.current) return;
    // Synchronous shared gate: an active dismiss (or its pending
    // authoritative refresh) owns the record — this submit fails
    // closed instead of posting with the same stale version.
    const token = gate.acquire();
    if (token === null) return;
    let gateFinished = false;
    setActionError(null);
    setWasConflict(false);

    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);
    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        setActionError(
          "Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.",
        );
        return;
      }
      await postUnansweredAction(
        accessToken,
        groupId,
        buildSetAnswerPayload({ version, answer }),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      // Success lifecycle follows the business resolution:
      //   refresh            → the gate owns the ONE authoritative
      //                        router.refresh(); the sibling stays
      //                        locked until fresh versions land.
      //   navigation_unmount → the workspace's router.push (started
      //                        synchronously inside onSuccess) will
      //                        unmount the keyed detail together with
      //                        this gate instance; deliberately NO
      //                        gate.finish, so the stale question can
      //                        never become interactable again while
      //                        still mounted.
      const mode = gateModeForUnansweredSuccess(onSuccess());
      gateFinished = true;
      if (mode === "refresh") {
        gate.finish(token, { refresh: true });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const status = error instanceof ApiError ? error.status : null;
      const kind = classifyUnansweredMutationFailure(status);
      if (kind === "conflict") {
        // Never overwrite: re-resolve, then tell the seller the record
        // changed elsewhere. The typed answer stays in the field, and
        // the sibling action stays blocked until the refreshed
        // version has landed (gate-tracked refresh).
        setWasConflict(true);
        gateFinished = true;
        gate.finish(token, { refresh: true });
        return;
      }
      setActionError(
        kind === "validation"
          ? "Cevap kaydedilemedi. Lütfen cevap metnini kontrol edip tekrar deneyin."
          : "Cevap şu anda kaydedilemedi. Metniniz korundu; lütfen tekrar deneyin.",
      );
    } finally {
      if (!gateFinished) {
        gate.finish(token, { refresh: false });
      }
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
      aria-label="Cevap kaydetme formu"
    >
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        {UNANSWERED_FUTURE_ONLY_NOTE} {UNANSWERED_NOT_A_RULE_NOTE}
      </p>
      <div className="space-y-1.5">
        <label
          htmlFor="unanswered-answer"
          className="block text-[12px] font-medium text-muted-foreground"
        >
          {UNANSWERED_ANSWER_LABEL}
        </label>
        <textarea
          id="unanswered-answer"
          name="answer"
          rows={5}
          value={answer}
          disabled={isSubmitting}
          maxLength={UNANSWERED_ANSWER_MAX_LENGTH}
          onChange={(event) => setAnswer(event.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
        />
      </div>
      {wasConflict ? (
        <p
          role="status"
          className="text-[12.5px] leading-snug text-muted-foreground"
        >
          Bu soru başka bir işlemle güncellendi; güncel hali getirildi.
        </p>
      ) : null}
      {actionError !== null ? (
        <p
          role="alert"
          className="text-[12.5px] leading-snug text-destructive"
        >
          {actionError}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={!canSubmit}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <Spinner size={14} label="Kaydediliyor" />
              <span>Kaydediliyor…</span>
            </span>
          ) : (
            submitLabel
          )}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Vazgeç
          </Button>
        ) : null}
      </div>
    </form>
  );
}
