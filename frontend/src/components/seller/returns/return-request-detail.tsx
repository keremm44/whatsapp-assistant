"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Image as ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip } from "@/components/shared/status-chip";
import { ApiError } from "@/lib/api/client";
import type {
  ReturnIssueType,
  ReturnRequestDetail,
  ReturnView,
} from "@/lib/seller/returns";
import { postMarkReturnHandled } from "@/lib/seller/returns-api";
import {
  buildMarkHandledPayload,
  canMarkReturnHandled,
  classifyReturnMutationFailure,
  formatReturnTimestamp,
  getReturnConversationHref,
  getReturnEvidenceSection,
  getReturnOrderNumberDisplay,
  getReturnRelatedOrderHref,
  RETURN_ACTION_LABEL,
  RETURN_ACTION_NOTE_LABEL,
  RETURN_ACTION_NOTE_MAX_LENGTH,
  RETURN_MISSING_FIELD_LABELS,
  RETURN_OPEN_CONVERSATION_LABEL,
  RETURN_PHONE_MISSING_LABEL,
  RETURN_PHOTO_PENDING_LABEL,
  RETURN_RELATED_ORDER_LABEL,
  RETURN_STATUS_DISPLAY,
  returnsWorkspaceHref,
} from "@/lib/seller/returns-format";
import { getBrowserAccessToken } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

import { ReturnEvidencePreview } from "./return-evidence-preview";

/**
 * Selected return/issue detail — the right region of the workspace
 * (full-width on mobile, with an obvious list-return affordance).
 *
 * Organized exactly around the page's mental model:
 *   A. Ne oldu?     issue type + the customer's exact reason text
 *   B. Sipariş      number snapshot + product name snapshot
 *   C. Müşteri      name (when present) + WhatsApp number
 *   D. Kanıt        evidence items, or a quiet “Fotoğraf bekleniyor”
 *                   ONLY when the seller's settings require one
 *   E. Sistem durumu status / timestamps / what the assistant is
 *                   still collecting (missing_fields, backend-owned)
 *   F. Seller action “İlgilenildi olarak işaretle” — the only action,
 *                   gated strictly by the backend capability signal
 *
 * The panel never invents fulfillment/refund/review semantics, never
 * rewrites customer text, and never shows the raw review_reason_code.
 */
export function ReturnRequestDetail({
  detail,
  view,
  query,
  issueType,
  onHandledSuccess,
}: {
  detail: ReturnRequestDetail;
  /** Current filter context — keeps “Listeye dön” on the same queue. */
  view: ReturnView;
  query: string | null;
  issueType: ReturnIssueType | null;
  /** Called once after a successful mark_handled; the workspace re-resolves. */
  onHandledSuccess: () => void;
}) {
  const router = useRouter();
  const { request } = detail;

  // Seller-subtree portal host for the evidence preview: a body-level
  // portal escapes the `.seller-theme` class and would render with the
  // light root palette (same contract as conversation-detail-panel).
  const [portalHost, setPortalHost] = React.useState<HTMLDivElement | null>(
    null,
  );

  const [note, setNote] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [wasConflict, setWasConflict] = React.useState(false);
  const [previewTarget, setPreviewTarget] = React.useState<{
    messageId: number;
    position: number;
  } | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      inflightRef.current?.abort();
    };
  }, []);

  const statusDisplay = RETURN_STATUS_DISPLAY[request.status];
  const evidenceSection = getReturnEvidenceSection(detail);
  const orderNumber = getReturnOrderNumberDisplay(request);
  const productName =
    detail.request.productNameSnapshot ??
    detail.order?.productNameSnapshot ??
    null;
  const reviewNote =
    typeof request.reviewNote === "string" &&
    request.reviewNote.trim().length > 0
      ? request.reviewNote.trim()
      : null;
  const customerName =
    detail.customer?.name && detail.customer.name.trim().length > 0
      ? detail.customer.name.trim()
      : null;
  const customerPhone =
    detail.customer?.whatsappNumber &&
    detail.customer.whatsappNumber.trim().length > 0
      ? detail.customer.whatsappNumber
      : RETURN_PHONE_MISSING_LABEL;
  // Cross-panel navigation from real ids only: the conversation link
  // needs the detail's customer id; the related-order link needs a
  // backend-returned order with a usable external number.
  const conversationHref = getReturnConversationHref(
    detail.customer?.id ?? null,
  );
  const relatedOrderHref = getReturnRelatedOrderHref(detail.order);

  const createdLabel = formatReturnTimestamp(request.createdAt);
  const updatedLabel = formatReturnTimestamp(request.updatedAt);
  const handledLabel = request.handledAt
    ? formatReturnTimestamp(request.handledAt)
    : null;
  const sellerNote =
    request.sellerNote && request.sellerNote.trim().length > 0
      ? request.sellerNote.trim()
      : null;

  const mayMarkHandled = canMarkReturnHandled(request);

  const onSubmitHandled = async () => {
    if (isSubmitting || inflightRef.current) return;
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
      // No optimistic state change: only a successful backend response
      // moves the workspace; on failure the detail stays exactly as is.
      const payload = buildMarkHandledPayload({
        version: request.version,
        note,
      });
      await postMarkReturnHandled(
        accessToken,
        request.id,
        payload,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      onHandledSuccess();
    } catch (error) {
      if (controller.signal.aborted) return;
      const status = error instanceof ApiError ? error.status : null;
      if (classifyReturnMutationFailure(status) === "conflict") {
        // Never overwrite: re-resolve, then tell the seller the record
        // changed elsewhere. The typed note stays in the field.
        setWasConflict(true);
        router.refresh();
        return;
      }
      setActionError(
        "İşlem şu anda tamamlanamadı. Notunuz korundu; lütfen tekrar deneyin.",
      );
    } finally {
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div ref={setPortalHost} className="contents" />
      {/* Mobile: obvious queue-return affordance, filters preserved. */}
      <div className="border-b border-divider px-4 py-2.5 md:px-5 lg:hidden">
        <Link
          href={
            returnsWorkspaceHref({ view, query, issueType }) as Route
          }
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
        {/* A. Ne oldu? */}
        <section aria-labelledby="return-detail-what">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="return-detail-what"
              className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Ne oldu?
            </h2>
            <StatusChip tone={statusDisplay.tone} className="shrink-0">
              {statusDisplay.label}
            </StatusChip>
          </div>
          <p className="mt-2 font-heading text-lg font-medium leading-snug text-foreground">
            {request.displayIssueType}
          </p>
          {request.reasonText !== null &&
          request.reasonText.trim().length > 0 ? (
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {request.reasonText.trim()}
            </p>
          ) : (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Henüz sorun açıklaması alınmadı.
            </p>
          )}
          {reviewNote !== null ? (
            <p className="mt-2 rounded-sm border-l-2 border-l-accent bg-accent-muted/45 py-2 pl-3 pr-3 text-[12.5px] leading-snug text-accent-text">
              {reviewNote}
            </p>
          ) : null}
        </section>

        {/* B. Sipariş */}
        <DetailSection title="Sipariş">
          <dl className="space-y-1.5">
            <DetailRow
              label="Sipariş numarası"
              value={orderNumber.text}
              valueTone={orderNumber.isPending ? "muted" : "default"}
            />
            {productName !== null && productName.trim().length > 0 ? (
              <DetailRow label="Ürün" value={productName} />
            ) : null}
          </dl>
          {relatedOrderHref !== null ? (
            <DetailNavLink href={relatedOrderHref}>
              {RETURN_RELATED_ORDER_LABEL}
            </DetailNavLink>
          ) : null}
        </DetailSection>

        {/* C. Müşteri */}
        <DetailSection title="Müşteri">
          <dl className="space-y-1.5">
            {customerName !== null ? (
              <DetailRow label="İsim" value={customerName} />
            ) : null}
            <DetailRow label="WhatsApp numarası" value={customerPhone} />
          </dl>
          {conversationHref !== null ? (
            <DetailNavLink href={conversationHref}>
              {RETURN_OPEN_CONVERSATION_LABEL}
            </DetailNavLink>
          ) : null}
        </DetailSection>

        {/* D. Kanıt */}
        {evidenceSection.kind !== "none" ? (
          <DetailSection title="Kanıt">
            {evidenceSection.kind === "items" ? (
              <ul
                aria-label="Kanıt fotoğrafları"
                className="flex flex-wrap gap-2"
              >
                {detail.evidence.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewTarget({
                          messageId: item.messageId,
                          position: index + 1,
                        })
                      }
                      className={cn(
                        "inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface-2/50 px-3 text-[13px] font-medium text-foreground transition-colors",
                        "hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      )}
                    >
                      <ImageIcon
                        aria-hidden="true"
                        size={15}
                        strokeWidth={1.75}
                        className="text-muted-foreground"
                      />
                      <span>
                        {detail.evidence.length > 1
                          ? `Fotoğraf ${index + 1}`
                          : "Fotoğraf"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {RETURN_PHOTO_PENDING_LABEL}
              </p>
            )}
          </DetailSection>
        ) : null}

        {/* E. Sistem durumu */}
        <DetailSection title="Sistem durumu">
          {request.status === "COLLECTING" ? (
            <div className="space-y-2">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Asistan bu talep için müşteriden bilgi toplamaya devam
                ediyor.
              </p>
              {detail.missingFields.length > 0 ? (
                <ul
                  aria-label="Beklenen bilgiler"
                  className="flex flex-wrap gap-1.5"
                >
                  {detail.missingFields.map((field) => (
                    <li
                      key={field}
                      className="rounded-sm border border-divider bg-surface-2/50 px-2 py-1 text-[11.5px] font-medium text-muted-foreground"
                    >
                      {RETURN_MISSING_FIELD_LABELS[field]}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {request.status === "HANDLED" && sellerNote !== null ? (
            <div className="space-y-1">
              <p className="text-[12px] font-medium text-muted-foreground">
                Satıcı notu
              </p>
              <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                {sellerNote}
              </p>
            </div>
          ) : null}

          <dl className="space-y-1.5">
            {createdLabel !== null ? (
              <DetailRow label="Kayıt tarihi" value={createdLabel} />
            ) : null}
            {updatedLabel !== null ? (
              <DetailRow label="Son güncelleme" value={updatedLabel} />
            ) : null}
            {handledLabel !== null ? (
              <DetailRow
                label="İlgilenildi olarak işaretlendi"
                value={handledLabel}
              />
            ) : null}
          </dl>
        </DetailSection>

        {/* F. Seller action — gated strictly by backend capability */}
        {mayMarkHandled ? (
          <section
            aria-labelledby="return-detail-action"
            className="space-y-3 rounded-md border border-divider bg-surface-2/40 p-4"
          >
            <h3
              id="return-detail-action"
              className="text-[13px] font-semibold text-foreground"
            >
              {RETURN_ACTION_LABEL}
            </h3>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              Bu işlem yalnızca talebi operasyonel olarak ele aldığınızı
              işaretler.
            </p>
            <div className="space-y-1.5">
              <label
                htmlFor="return-action-note"
                className="block text-[12px] font-medium text-muted-foreground"
              >
                {RETURN_ACTION_NOTE_LABEL}
              </label>
              <textarea
                id="return-action-note"
                name="note"
                rows={3}
                value={note}
                disabled={isSubmitting}
                maxLength={RETURN_ACTION_NOTE_MAX_LENGTH}
                onChange={(event) => setNote(event.target.value)}
                className="w-full rounded-md border border-border bg-control px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
              />
            </div>
            {wasConflict ? (
              <p
                role="status"
                className="text-[12.5px] leading-snug text-muted-foreground"
              >
                Kayıt başka bir işlemle güncellendi; güncel hali
                getirildi.
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
            <div>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={onSubmitHandled}
                disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size={14} label="İşaretleniyor" />
                    <span>İşaretleniyor…</span>
                  </span>
                ) : (
                  RETURN_ACTION_LABEL
                )}
              </Button>
            </div>
          </section>
        ) : null}
      </div>

      {previewTarget !== null ? (
        <ReturnEvidencePreview
          messageId={previewTarget.messageId}
          position={previewTarget.position}
          total={detail.evidence.length}
          open
          onOpenChange={(open) => {
            if (!open) setPreviewTarget(null);
          }}
          portalContainer={portalHost}
        />
      ) : null}
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 border-t border-divider pt-4">
      <h2 className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function DetailRow({
  label,
  value,
  valueTone = "default",
}: {
  label: string;
  value: string;
  valueTone?: "default" | "muted";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-[12.5px] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 break-words text-right text-[13px] tabular-nums",
          valueTone === "muted"
            ? "text-muted-foreground"
            : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Quiet secondary navigation inside a detail section — a real Link to
 * an existing workspace, never a detail route that does not exist.
 */
function DetailNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as Route}
      className={cn(
        "inline-flex min-h-11 items-center gap-1 rounded-sm px-1 text-[12.5px] font-medium text-primary-text transition-colors md:min-h-8",
        "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      )}
    >
      <span>{children}</span>
      <ArrowUpRight aria-hidden="true" size={13} strokeWidth={1.75} />
    </Link>
  );
}
