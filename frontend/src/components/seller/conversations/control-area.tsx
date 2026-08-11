"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import type { ConversationControlBootstrap } from "@/lib/seller/conversations-server";
import {
  fetchConversationControl,
  mutateConversationControl,
  type ConversationCapabilities,
  type ConversationControlView,
} from "@/lib/seller/conversations";
import {
  CONTROL_STATE_CHIP_TONE,
  resolveConversationHandoff,
} from "@/lib/seller/conversations-format";
import { getBrowserAccessToken } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

/**
 * Conversation control area — the single clearest answer to
 * "şu anda bu konuşmayla kim ilgileniyor?".
 *
 * Presentation is backend-led end to end:
 *   - The chip label is the control endpoint's own `display_name`
 *     ("Asistan aktif" / "Siz ilgileniyorsunuz" / "İade incelemesi" /
 *     "Yanıtlar durduruldu"). The frontend owns only the chip tone.
 *   - The handoff button is rendered ONLY from the backend capability
 *     map (resolveConversationHandoff). V1 exposes exactly one
 *     reversible action:
 *       can_take_over      → "Ben ilgileneceğim" (take_over)
 *       can_resume         → "Asistana bırak"    (resume_assistant)
 *     `pause_assistant` and `activate_assistant` are never posted and
 *     never shown — the deliberate V1 mental model is one handoff.
 *   - Optimistic concurrency is mandatory: every POST carries the
 *     `expected_version` of the control state the seller was looking
 *     at. A 409 conflict surfaces the backend's own calm message,
 *     immediately refetches the authoritative control state, and
 *     refreshes the server regions so no stale state lingers.
 *
 * Degradation: if the control endpoint is unavailable the timeline
 * keeps rendering; this area degrades to a retryable note and shows
 * NO unsupported action. Failure paths never sign the seller out.
 */
export function ConversationControlArea({
  customerId,
  initialControl,
}: {
  customerId: number;
  initialControl: ConversationControlBootstrap;
}) {
  const router = useRouter();
  const [control, setControl] = React.useState<ConversationControlBootstrap>(
    initialControl,
  );
  const [isPending, setIsPending] = React.useState(false);
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    setControl(initialControl);
  }, [initialControl]);

  React.useEffect(() => {
    return () => {
      inflightRef.current?.abort();
    };
  }, []);

  const readyView: ConversationControlView | null =
    control.state === "ready" ? control.view : null;
  const handoff = readyView
    ? resolveConversationHandoff(readyView.capabilities)
    : null;

  const reloadControl = async (signal: AbortSignal): Promise<boolean> => {
    const accessToken = await getBrowserAccessToken();
    if (signal.aborted) return false;
    if (!accessToken) return false;
    try {
      const view = await fetchConversationControl(accessToken, customerId, {
        signal,
      });
      if (signal.aborted) return false;
      setControl({ state: "ready", view });
      return true;
    } catch {
      return false;
    }
  };

  const onRetryLoad = async () => {
    if (isPending || isRetrying || inflightRef.current) return;
    const controller = new AbortController();
    inflightRef.current = controller;
    setIsRetrying(true);
    setErrorMessage(null);
    const ok = await reloadControl(controller.signal);
    if (controller.signal.aborted) return;
    if (!ok) {
      setErrorMessage(
        "Kontrol bilgisi şu anda alınamadı. Lütfen tekrar deneyin.",
      );
    }
    if (inflightRef.current === controller) {
      inflightRef.current = null;
    }
    setIsRetrying(false);
  };

  const onHandoff = async (
    capabilities: ConversationCapabilities,
    expectedVersion: number,
  ) => {
    const handoff = resolveConversationHandoff(capabilities);
    if (!handoff) return;
    if (isPending || isRetrying || inflightRef.current) return;
    setErrorMessage(null);

    const controller = new AbortController();
    inflightRef.current = controller;
    setIsPending(true);
    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        setErrorMessage(
          "Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.",
        );
        return;
      }
      const result = await mutateConversationControl(
        accessToken,
        customerId,
        {
          action: handoff.action,
          expectedVersion,
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      // The mutation response IS the authoritative new control
      // presentation (state, display name, capabilities, version).
      setControl({
        state: "ready",
        view: {
          customerId: result.customerId,
          control: result.control,
          capabilities: result.capabilities,
        },
      });
      // Refresh the server regions so the queue row's attention
      // marker and ordering stay consistent with the new state.
      router.refresh();
    } catch (error) {
      if (controller.signal.aborted) return;
      // A stale expected_version surfaces the backend's own calm
      // conflict sentence. We then pull the authoritative control
      // state and refresh the page regions so a stale optimistic
      // state never lingers.
      if (error instanceof ApiError && error.status === 409) {
        setErrorMessage(
          error.message ||
            "Konuşmanın durumu değişti. Güncel bilgileri yenileyip tekrar deneyin.",
        );
        await reloadControl(controller.signal);
        if (controller.signal.aborted) return;
        router.refresh();
      } else if (error instanceof ApiError && error.message) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(
          "İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.",
        );
      }
    } finally {
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1.5 md:items-end">
      <div className="flex flex-wrap items-center gap-2">
        {readyView ? (
          <ControlChip
            state={readyView.control.state}
            displayName={readyView.control.displayName}
          />
        ) : (
          <span className="text-[12px] text-muted-foreground">
            Kontrol bilgisi alınamadı
          </span>
        )}

        {readyView && handoff ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() =>
              onHandoff(readyView.capabilities, readyView.control.version)
            }
            disabled={isPending || isRetrying}
            aria-busy={isPending}
          >
            {isPending ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size={14} label="Kaydediliyor" />
                <span>{handoff.label}</span>
              </span>
            ) : (
              handoff.label
            )}
          </Button>
        ) : null}

        {!readyView ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRetryLoad}
            disabled={isPending || isRetrying}
            aria-busy={isRetrying}
            className="text-muted-foreground"
          >
            {isRetrying ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size={14} label="Yükleniyor" />
                <span>Yükleniyor…</span>
              </span>
            ) : (
              "Tekrar dene"
            )}
          </Button>
        ) : null}
      </div>

      {readyView && handoff ? (
        <p className="max-w-[240px] text-[11.5px] leading-snug text-muted-foreground md:text-right">
          {handoff.supporting}
        </p>
      ) : null}

      {errorMessage ? (
        <p
          role="alert"
          className="max-w-[280px] text-[12px] leading-snug text-destructive md:text-right"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Tonal state chip. The label is the backend's own display name;
 * only the tone is a frontend presentation decision.
 */
function ControlChip({
  state,
  displayName,
}: {
  state: ConversationControlView["control"]["state"];
  displayName: string;
}) {
  const tone = CONTROL_STATE_CHIP_TONE[state];
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-pill px-2.5 text-[11px] font-semibold",
        tone.chipClassName,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 rounded-full", tone.dotClassName)}
      />
      {displayName}
    </span>
  );
}
