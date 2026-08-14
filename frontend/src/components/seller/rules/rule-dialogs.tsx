"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import {
  buildCreateRulePayload,
  buildEditRulePayload,
  buildReactivateRulePayload,
  RULE_RESPONSE_MAX_LENGTH,
  RULE_RESPONSE_MIN_LENGTH,
  RULE_TRIGGER_MAX_LENGTH,
  RULE_TRIGGER_MIN_LENGTH,
  type SellerRule,
} from "@/lib/seller/rules";
import {
  createRule,
  deactivateRule,
  updateRule,
} from "@/lib/seller/rules-api";
import {
  classifyRulesMutationFailure,
  isRuleDuplicateConflict,
  RULE_CONFLICT_MESSAGE,
  RULE_DEACTIVATE_EXPLANATION,
  RULE_DUPLICATE_MESSAGE,
  RULE_MATCHING_HELP,
  RULE_RESPONSE_LABEL,
  RULE_TRIGGER_LABEL,
  RULES_CREATE_DIALOG_TITLE,
  RULES_CREATE_LABEL,
  RULES_EDIT_DIALOG_TITLE,
  RULES_DEACTIVATE_LABEL,
  RULES_REACTIVATE_LABEL,
} from "@/lib/seller/rules-format";
import type { RecordMutationGate } from "@/components/shared/use-record-mutation-gate";
import { getBrowserAccessToken } from "@/lib/supabase/client";

const usePortalHost = () => {
  const [host, setHost] = React.useState<HTMLDivElement | null>(null);
  return { host, setHost };
};

const lengthOk = (value: string, min: number, max: number): boolean => {
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max;
};

export function RuleCreateDialog() {
  const router = useRouter();
  const { host, setHost } = usePortalHost();
  const [open, setOpen] = React.useState(false);
  const [triggerText, setTriggerText] = React.useState("");
  const [responseText, setResponseText] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => inflightRef.current?.abort(), []);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting || inflightRef.current) return;
    if (
      !lengthOk(triggerText, RULE_TRIGGER_MIN_LENGTH, RULE_TRIGGER_MAX_LENGTH) ||
      !lengthOk(responseText, RULE_RESPONSE_MIN_LENGTH, RULE_RESPONSE_MAX_LENGTH)
    ) {
      setError("İfade 2–150, cevap 2–1500 karakter olmalıdır.");
      return;
    }
    setError(null);
    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);
    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        setError("Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.");
        return;
      }
      await createRule(
        accessToken,
        buildCreateRulePayload({ triggerText, responseText }),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setTriggerText("");
      setResponseText("");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError) {
        const kind = classifyRulesMutationFailure(caught.status);
        if (kind === "conflict") {
          setError(
            isRuleDuplicateConflict(caught.body)
              ? RULE_DUPLICATE_MESSAGE
              : RULE_CONFLICT_MESSAGE,
          );
          return;
        }
        if (kind === "validation") {
          setError("Cevap bilgileri geçersiz. Lütfen kontrol edip tekrar deneyin.");
          return;
        }
      }
      setError(
        "İşlem şu anda tamamlanamadı. Girdiğiniz metin korundu; lütfen tekrar deneyin.",
      );
    } finally {
      if (inflightRef.current === controller) inflightRef.current = null;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div ref={setHost} className="contents" />
      <Button type="button" size="md" onClick={() => setOpen(true)}>
        {RULES_CREATE_LABEL}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false);
            setError(null);
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-lg overflow-y-auto"
          portalContainer={host}
        >
          <DialogTitle>{RULES_CREATE_DIALOG_TITLE}</DialogTitle>
          <DialogDescription>{RULE_MATCHING_HELP}</DialogDescription>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rule-create-trigger">{RULE_TRIGGER_LABEL}</Label>
              <Input
                id="rule-create-trigger"
                value={triggerText}
                maxLength={RULE_TRIGGER_MAX_LENGTH}
                disabled={isSubmitting}
                placeholder="toplu sipariş"
                onChange={(event) => setTriggerText(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-create-response">{RULE_RESPONSE_LABEL}</Label>
              <textarea
                id="rule-create-response"
                value={responseText}
                maxLength={RULE_RESPONSE_MAX_LENGTH}
                disabled={isSubmitting}
                rows={5}
                onChange={(event) => setResponseText(event.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
              />
            </div>
            {error ? (
              <p role="alert" className="text-[12.5px] leading-snug text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size={14} label="Kaydediliyor" />
                    <span>Kaydediliyor…</span>
                  </span>
                ) : (
                  "Kaydet"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => setOpen(false)}
              >
                Vazgeç
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RuleEditDialog({
  rule,
  gate,
}: {
  rule: SellerRule;
  /**
   * Shared rule-record mutation gate: Edit and Status PATCH the same
   * rule.version, so they may never overlap. While the sibling owns
   * the gate (mutation or its authoritative refresh) the trigger is
   * natively disabled and the submit fails closed.
   */
  gate: RecordMutationGate;
}) {
  const { host, setHost } = usePortalHost();
  const [open, setOpen] = React.useState(false);
  const [triggerText, setTriggerText] = React.useState(rule.triggerText);
  const [responseText, setResponseText] = React.useState(rule.responseText);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    setTriggerText(rule.triggerText);
    setResponseText(rule.responseText);
  }, [rule.id, rule.triggerText, rule.responseText, rule.version]);

  React.useEffect(() => () => inflightRef.current?.abort(), []);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting || inflightRef.current) return;
    if (
      !lengthOk(triggerText, RULE_TRIGGER_MIN_LENGTH, RULE_TRIGGER_MAX_LENGTH) ||
      !lengthOk(responseText, RULE_RESPONSE_MIN_LENGTH, RULE_RESPONSE_MAX_LENGTH)
    ) {
      setError("İfade 2–150, cevap 2–1500 karakter olmalıdır.");
      return;
    }
    // Synchronous shared gate: an active Status mutation (or its
    // pending authoritative refresh) owns the record — this submit
    // fails closed instead of issuing a PATCH with the same stale
    // version, even if the dialog was already open.
    const token = gate.acquire();
    if (token === null) return;
    let gateFinished = false;
    setError(null);
    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);
    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        setError("Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.");
        return;
      }
      await updateRule(
        accessToken,
        rule.id,
        buildEditRulePayload({
          version: rule.version,
          triggerText,
          responseText,
        }),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setOpen(false);
      // Authoritative refresh through the gate: the sibling stays
      // locked until the refreshed rule/version has landed.
      gateFinished = true;
      gate.finish(token, { refresh: true });
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError) {
        const kind = classifyRulesMutationFailure(caught.status);
        if (kind === "conflict") {
          setError(
            isRuleDuplicateConflict(caught.body)
              ? RULE_DUPLICATE_MESSAGE
              : RULE_CONFLICT_MESSAGE,
          );
          gateFinished = true;
          gate.finish(token, { refresh: true });
          return;
        }
      }
      setError("İşlem şu anda tamamlanamadı. Girdiğiniz metin korundu.");
    } finally {
      // Transient paths release the shared gate once this request has
      // safely finished; the typed draft is preserved as before.
      // Stale tokens are a no-op inside gate.finish.
      if (!gateFinished) {
        gate.finish(token, { refresh: false });
      }
      if (inflightRef.current === controller) inflightRef.current = null;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div ref={setHost} className="contents" />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="min-h-11"
        disabled={gate.locked}
        onClick={() => setOpen(true)}
      >
        Düzenle
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false);
            setError(null);
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-lg overflow-y-auto"
          portalContainer={host}
        >
          <DialogTitle>{RULES_EDIT_DIALOG_TITLE}</DialogTitle>
          <DialogDescription>{RULE_MATCHING_HELP}</DialogDescription>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`rule-edit-trigger-${rule.id}`}>
                {RULE_TRIGGER_LABEL}
              </Label>
              <Input
                id={`rule-edit-trigger-${rule.id}`}
                value={triggerText}
                maxLength={RULE_TRIGGER_MAX_LENGTH}
                disabled={isSubmitting}
                onChange={(event) => setTriggerText(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`rule-edit-response-${rule.id}`}>
                {RULE_RESPONSE_LABEL}
              </Label>
              <textarea
                id={`rule-edit-response-${rule.id}`}
                value={responseText}
                maxLength={RULE_RESPONSE_MAX_LENGTH}
                disabled={isSubmitting}
                rows={5}
                onChange={(event) => setResponseText(event.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
              />
            </div>
            {error ? (
              <p role="alert" className="text-[12.5px] leading-snug text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                disabled={isSubmitting || gate.locked}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? "Kaydediliyor…" : "Kaydet"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => setOpen(false)}
              >
                Vazgeç
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RuleStatusDialog({
  rule,
  gate,
}: {
  rule: SellerRule;
  /** Shared rule-record mutation gate — see RuleEditDialog. */
  gate: RecordMutationGate;
}) {
  const { host, setHost } = usePortalHost();
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => inflightRef.current?.abort(), []);

  const onConfirm = async () => {
    if (isSubmitting || inflightRef.current) return;
    // Synchronous shared gate: an active Edit mutation (or its
    // pending authoritative refresh) owns the record — this confirm
    // fails closed instead of issuing a PATCH with the same stale
    // version.
    const token = gate.acquire();
    if (token === null) return;
    let gateFinished = false;
    setError(null);
    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);
    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        setError("Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.");
        return;
      }
      if (rule.isActive) {
        await deactivateRule(accessToken, rule.id, rule.version, {
          signal: controller.signal,
        });
      } else {
        await updateRule(
          accessToken,
          rule.id,
          buildReactivateRulePayload(rule.version),
          { signal: controller.signal },
        );
      }
      if (controller.signal.aborted) return;
      setOpen(false);
      gateFinished = true;
      gate.finish(token, { refresh: true });
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (
        caught instanceof ApiError &&
        classifyRulesMutationFailure(caught.status) === "conflict"
      ) {
        setError(RULE_CONFLICT_MESSAGE);
        gateFinished = true;
        gate.finish(token, { refresh: true });
        return;
      }
      setError("İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.");
    } finally {
      if (!gateFinished) {
        gate.finish(token, { refresh: false });
      }
      if (inflightRef.current === controller) inflightRef.current = null;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div ref={setHost} className="contents" />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="min-h-11"
        disabled={gate.locked}
        onClick={() => setOpen(true)}
      >
        {rule.isActive ? RULES_DEACTIVATE_LABEL : RULES_REACTIVATE_LABEL}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false);
            setError(null);
          }
        }}
      >
        <DialogContent className="max-w-md" portalContainer={host}>
          <DialogTitle>
            {rule.isActive ? RULES_DEACTIVATE_LABEL : RULES_REACTIVATE_LABEL}
          </DialogTitle>
          <DialogDescription>
            {rule.isActive
              ? RULE_DEACTIVATE_EXPLANATION
              : "Bu cevap yeniden etkinleştirildiğinde yeni müşteri mesajlarında tekrar kullanılabilir."}
          </DialogDescription>
          {error ? (
            <p role="alert" className="text-[12.5px] leading-snug text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={isSubmitting || gate.locked}
              aria-busy={isSubmitting}
              onClick={() => {
                void onConfirm();
              }}
            >
              {isSubmitting ? "Kaydediliyor…" : "Onayla"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isSubmitting}
              onClick={() => setOpen(false)}
            >
              Vazgeç
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
