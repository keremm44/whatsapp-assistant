"use client";

import * as React from "react";

import { SectionHeader } from "@/components/shared/section-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  createSellerFeedback,
  fetchSellerFeedbackDetail,
  fetchSellerFeedbackList,
} from "@/lib/seller/feedback-api";
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_SUBJECT_MAX_LENGTH,
  formatFeedbackDate,
  normalizeSellerFeedbackCreatePayload,
  validateSellerFeedbackCreatePayload,
  type SellerFeedback,
  type SellerFeedbackCategory,
  type SellerFeedbackStatus,
} from "@/lib/seller/feedback";
import { getBrowserAccessToken } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

const PAGE_SIZE = 10;
const CATEGORY_OPTIONS = Object.entries(FEEDBACK_CATEGORY_LABELS) as [
  SellerFeedbackCategory,
  string,
][];

const statusTone = (status: SellerFeedbackStatus): "muted" | "success" =>
  status === "RESOLVED" ? "success" : "muted";

export function SellerFeedbackWorkspace() {
  const [category, setCategory] =
    React.useState<SellerFeedbackCategory>("suggestion");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = React.useState<string | null>(null);

  const [rows, setRows] = React.useState<SellerFeedback[]>([]);
  const [total, setTotal] = React.useState(0);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [listError, setListError] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<number | null>(null);
  const [detailLoadingIds, setDetailLoadingIds] = React.useState<Set<number>>(
    () => new Set(),
  );
  const [detailErrors, setDetailErrors] = React.useState<Record<number, string>>(
    {},
  );

  const listControllerRef = React.useRef<AbortController | null>(null);
  const submitControllerRef = React.useRef<AbortController | null>(null);
  const detailControllersRef = React.useRef(new Map<number, AbortController>());
  const hasLoadedRef = React.useRef(false);
  const rowsRef = React.useRef<SellerFeedback[]>([]);
  rowsRef.current = rows;

  const loadFirstPage = React.useCallback(async () => {
    listControllerRef.current?.abort();
    const controller = new AbortController();
    listControllerRef.current = controller;
    setIsLoadingMore(false);
    setListError(null);
    if (!hasLoadedRef.current) setIsInitialLoading(true);

    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) throw new Error("feedback_session_unavailable");

      const page = await fetchSellerFeedbackList(accessToken, {
        limit: PAGE_SIZE,
        offset: 0,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      setRows(page.feedback);
      setTotal(page.total);
      setHasLoaded(true);
      hasLoadedRef.current = true;
    } catch {
      if (controller.signal.aborted) return;
      setListError("Gönderdikleriniz şu anda yüklenemedi. Tekrar deneyebilirsiniz.");
    } finally {
      if (listControllerRef.current === controller) {
        listControllerRef.current = null;
        setIsInitialLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    void loadFirstPage();
    return () => {
      listControllerRef.current?.abort();
      submitControllerRef.current?.abort();
      for (const controller of detailControllersRef.current.values()) {
        controller.abort();
      }
      detailControllersRef.current.clear();
    };
  }, [loadFirstPage]);

  const draft = { category, subject, message };
  const validation = validateSellerFeedbackCreatePayload(draft);
  const canSubmit =
    Object.keys(validation).length === 0 && !isSubmitting;

  const submitFeedback = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setSubmitAttempted(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    const currentValidation = validateSellerFeedbackCreatePayload(draft);
    if (Object.keys(currentValidation).length > 0) return;

    const controller = new AbortController();
    submitControllerRef.current?.abort();
    submitControllerRef.current = controller;
    setIsSubmitting(true);

    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) throw new Error("feedback_session_unavailable");

      const created = await createSellerFeedback(
        accessToken,
        normalizeSellerFeedbackCreatePayload(draft),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;

      setRows((current) => {
        const existed = current.some((item) => item.id === created.id);
        const next = [created, ...current.filter((item) => item.id !== created.id)];
        const visibleLength = Math.max(current.length, PAGE_SIZE);
        if (!existed) setTotal((value) => value + 1);
        return next.slice(0, visibleLength);
      });
      setHasLoaded(true);
      hasLoadedRef.current = true;
      setCategory("suggestion");
      setSubject("");
      setMessage("");
      setSubmitAttempted(false);
      setSubmitSuccess("Geri bildiriminiz gönderildi.");
    } catch {
      if (controller.signal.aborted) return;
      setSubmitError("Geri bildiriminiz gönderilemedi. Tekrar deneyebilirsiniz.");
    } finally {
      if (submitControllerRef.current === controller) {
        submitControllerRef.current = null;
        setIsSubmitting(false);
      }
    }
  };

  const refreshDetail = async (item: SellerFeedback) => {
    detailControllersRef.current.get(item.id)?.abort();
    const controller = new AbortController();
    detailControllersRef.current.set(item.id, controller);
    setDetailLoadingIds((current) => new Set(current).add(item.id));
    setDetailErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) throw new Error("feedback_session_unavailable");

      const fresh = await fetchSellerFeedbackDetail(accessToken, item.id, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      setRows((current) =>
        current.map((row) => (row.id === fresh.id ? fresh : row)),
      );
    } catch {
      if (controller.signal.aborted) return;
      setDetailErrors((current) => ({
        ...current,
        [item.id]: "Güncel durum alınamadı; son yüklenen bilgiler gösteriliyor.",
      }));
    } finally {
      if (detailControllersRef.current.get(item.id) === controller) {
        detailControllersRef.current.delete(item.id);
        setDetailLoadingIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      }
    }
  };

  const toggleDetail = (item: SellerFeedback) => {
    const opening = expandedId !== item.id;
    if (!opening) {
      detailControllersRef.current.get(item.id)?.abort();
      detailControllersRef.current.delete(item.id);
      setDetailLoadingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      setExpandedId(null);
      return;
    }

    setExpandedId(item.id);
    void refreshDetail(item);
  };

  const loadMore = async () => {
    if (isLoadingMore || rowsRef.current.length >= total) return;
    setIsLoadingMore(true);
    setListError(null);

    const controller = new AbortController();
    listControllerRef.current?.abort();
    listControllerRef.current = controller;

    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) throw new Error("feedback_session_unavailable");

      const page = await fetchSellerFeedbackList(accessToken, {
        limit: PAGE_SIZE,
        offset: rowsRef.current.length,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      setRows((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...page.feedback.filter((item) => !seen.has(item.id)),
        ];
      });
      setTotal(page.total);
    } catch {
      if (controller.signal.aborted) return;
      setListError("Daha fazla geri bildirim yüklenemedi. Tekrar deneyebilirsiniz.");
    } finally {
      if (listControllerRef.current === controller) {
        listControllerRef.current = null;
        setIsLoadingMore(false);
      }
    }
  };

  const moreAvailable = rows.length < total;

  return (
    <section className="space-y-5" aria-labelledby="seller-feedback-heading">
      <SectionHeader
        id="seller-feedback-heading"
        title="Geri Bildirim"
        description="Deneyiminizi, bir önerinizi veya karşılaştığınız bir sorunu bize iletin."
      />

      <form
        onSubmit={submitFeedback}
        className="space-y-4 rounded-md border border-border bg-surface-2 p-4 sm:p-5"
        noValidate
      >
        <div className="space-y-1.5">
          <Label htmlFor="feedback-category">Kategori</Label>
          <select
            id="feedback-category"
            name="feedback-category"
            value={category}
            disabled={isSubmitting}
            onChange={(event) =>
              setCategory(event.target.value as SellerFeedbackCategory)
            }
            className={cn(
              "min-h-11 w-full rounded-md border border-border bg-control px-3 py-2 text-sm text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {CATEGORY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="feedback-subject">Konu</Label>
            <span
              id="feedback-subject-count"
              className="text-[11px] type-figure text-muted-foreground"
            >
              {subject.length}/{FEEDBACK_SUBJECT_MAX_LENGTH}
            </span>
          </div>
          <input
            id="feedback-subject"
            name="feedback-subject"
            value={subject}
            maxLength={FEEDBACK_SUBJECT_MAX_LENGTH}
            disabled={isSubmitting}
            autoComplete="off"
            aria-invalid={submitAttempted && validation.subject ? true : undefined}
            aria-describedby={
              submitAttempted && validation.subject
                ? "feedback-subject-count feedback-subject-error"
                : "feedback-subject-count"
            }
            onChange={(event) => setSubject(event.target.value)}
            className={cn(
              "min-h-11 w-full rounded-md border border-border bg-control px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            placeholder="Kısaca ne hakkında olduğunu yazın"
          />
          {submitAttempted && validation.subject ? (
            <p id="feedback-subject-error" role="alert" className="text-[12.5px] text-destructive">
              {validation.subject}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="feedback-message">Mesaj</Label>
            <span
              id="feedback-message-count"
              className="text-[11px] type-figure text-muted-foreground"
            >
              {message.length}/{FEEDBACK_MESSAGE_MAX_LENGTH}
            </span>
          </div>
          <textarea
            id="feedback-message"
            name="feedback-message"
            value={message}
            maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
            rows={6}
            disabled={isSubmitting}
            aria-invalid={submitAttempted && validation.message ? true : undefined}
            aria-describedby={
              submitAttempted && validation.message
                ? "feedback-message-count feedback-message-error"
                : "feedback-message-count"
            }
            onChange={(event) => setMessage(event.target.value)}
            className={cn(
              "w-full resize-y rounded-md border border-border bg-control px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            placeholder="Detayları paylaşın"
          />
          {submitAttempted && validation.message ? (
            <p id="feedback-message-error" role="alert" className="text-[12.5px] text-destructive">
              {validation.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            size="sm"
            disabled={!canSubmit}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Spinner size={14} label="Geri bildirim gönderiliyor" />
                Gönderiliyor…
              </>
            ) : (
              "Geri bildirim gönder"
            )}
          </Button>
          {submitSuccess ? (
            <p role="status" className="text-[12.5px] font-medium text-success">
              {submitSuccess}
            </p>
          ) : null}
          {submitError ? (
            <p role="alert" className="text-[12.5px] text-destructive">
              {submitError}
            </p>
          ) : null}
        </div>
      </form>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Gönderdiklerim</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            Daha önce gönderdiğiniz geri bildirimlerin güncel durumunu buradan takip edebilirsiniz.
          </p>
        </div>

        {isInitialLoading && !hasLoaded ? (
          <div className="flex min-h-28 items-center justify-center gap-2 border-y border-divider py-6 text-sm text-muted-foreground" role="status">
            <Spinner size={16} label="Geri bildirimler yükleniyor" />
            <span>Gönderdikleriniz yükleniyor…</span>
          </div>
        ) : null}

        {!isInitialLoading && !hasLoaded && listError ? (
          <div className="space-y-3 border-y border-divider py-5" role="status">
            <p className="text-sm font-medium text-foreground">Gönderdikleriniz yüklenemedi.</p>
            <p className="text-[12.5px] text-muted-foreground">Bağlantı kurulamadı. Formu yine kullanabilirsiniz.</p>
            <Button type="button" variant="secondary" size="sm" onClick={loadFirstPage}>
              Tekrar dene
            </Button>
          </div>
        ) : null}

        {hasLoaded && rows.length === 0 ? (
          <div className="border-y border-divider py-5" role="status">
            <p className="text-sm font-medium text-foreground">Henüz geri bildirim göndermediniz</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">İlk geri bildiriminiz gönderildiğinde burada görünecek.</p>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <ul role="list" className="border-y border-divider">
            {rows.map((item) => {
              const expanded = expandedId === item.id;
              const detailLoading = detailLoadingIds.has(item.id);
              const detailError = detailErrors[item.id];

              return (
                <li key={item.id} className="border-b border-divider last:border-b-0">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => toggleDetail(item)}
                    className="w-full px-1 py-3 text-left transition-colors hover:bg-raised/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset sm:px-2"
                  >
                    <span className="flex items-start justify-between gap-4">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-medium text-muted-foreground">
                          {FEEDBACK_CATEGORY_LABELS[item.category]}
                        </span>
                        <span className="mt-0.5 block truncate text-[13.5px] font-medium text-foreground">
                          {item.subject}
                        </span>
                        <span className="mt-1 block text-[11px] type-figure text-muted-foreground">
                          {formatFeedbackDate(item.createdAt)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 pt-0.5">
                        <StatusChip tone={statusTone(item.status)}>
                          {FEEDBACK_STATUS_LABELS[item.status]}
                        </StatusChip>
                        <span aria-hidden="true" className="text-sm text-muted-foreground">
                          {expanded ? "−" : "+"}
                        </span>
                      </span>
                    </span>
                  </button>

                  {expanded ? (
                    <div className="space-y-3 px-1 pb-4 sm:px-2">
                      <div className="rounded-md border border-border bg-surface-2 p-3.5">
                        <dl className="grid gap-3 text-[12.5px] sm:grid-cols-2">
                          <div>
                            <dt className="text-muted-foreground">Kategori</dt>
                            <dd className="mt-0.5 font-medium text-foreground">
                              {FEEDBACK_CATEGORY_LABELS[item.category]}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Durum</dt>
                            <dd className="mt-0.5 font-medium text-foreground">
                              {FEEDBACK_STATUS_LABELS[item.status]}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Gönderildi</dt>
                            <dd className="mt-0.5 text-foreground">
                              {formatFeedbackDate(item.createdAt)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Son güncelleme</dt>
                            <dd className="mt-0.5 text-foreground">
                              {formatFeedbackDate(item.updatedAt)}
                            </dd>
                          </div>
                        </dl>
                        <div className="mt-4 border-t border-divider pt-3">
                          <p className="text-[11px] font-medium text-muted-foreground">Mesaj</p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                            {item.message}
                          </p>
                        </div>
                      </div>

                      {detailLoading ? (
                        <p role="status" className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Spinner size={12} label="Durum yenileniyor" />
                          Güncel durum kontrol ediliyor…
                        </p>
                      ) : null}
                      {detailError ? (
                        <p role="status" className="text-[11px] text-muted-foreground">
                          {detailError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {hasLoaded && (moreAvailable || listError) ? (
          <div className="space-y-2">
            {listError ? (
              <p role="status" className="text-[12px] text-muted-foreground">
                {listError}
              </p>
            ) : null}
            {moreAvailable ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                disabled={isLoadingMore}
                aria-busy={isLoadingMore}
                onClick={loadMore}
              >
                {isLoadingMore ? (
                  <>
                    <Spinner size={14} label="Daha fazla geri bildirim yükleniyor" />
                    Yükleniyor…
                  </>
                ) : (
                  "Daha fazla göster"
                )}
              </Button>
            ) : listError ? (
              <Button type="button" variant="ghost" size="sm" className="w-full" onClick={loadFirstPage}>
                Yenile
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
