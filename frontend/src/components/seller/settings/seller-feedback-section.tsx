"use client";

import * as React from "react";

import { SectionHeader } from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  createSellerFeedback,
  fetchSellerFeedbackList,
} from "@/lib/seller/feedback-api";
import {
  feedbackCategoryLabel,
  feedbackStatusLabel,
  formatFeedbackDate,
  SELLER_FEEDBACK_CATEGORIES,
  type SellerFeedback,
  type SellerFeedbackCategory,
  type SellerFeedbackStatus,
} from "@/lib/seller/feedback";
import { getBrowserAccessToken } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

const PAGE_SIZE = 10;
const SUBJECT_MAX = 200;
const MESSAGE_MAX = 4000;

const fieldClassName =
  "w-full rounded-control border border-boundary bg-control px-3 py-2 type-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50";

const statusClassName = (status: SellerFeedbackStatus): string => {
  if (status === "IN_REVIEW") return "border-primary/50 text-foreground";
  if (status === "RESOLVED") return "border-boundary text-foreground";
  return "border-boundary text-muted-foreground";
};

export function SellerFeedbackSection() {
  const [category, setCategory] = React.useState<SellerFeedbackCategory>("suggestion");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = React.useState<string | null>(null);

  const [items, setItems] = React.useState<SellerFeedback[]>([]);
  const [total, setTotal] = React.useState(0);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [listError, setListError] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<number | null>(null);

  const listControllerRef = React.useRef<AbortController | null>(null);
  const submitControllerRef = React.useRef<AbortController | null>(null);
  const itemsRef = React.useRef<SellerFeedback[]>([]);
  itemsRef.current = items;

  React.useEffect(() => {
    return () => {
      listControllerRef.current?.abort();
      submitControllerRef.current?.abort();
    };
  }, []);

  const loadFirstPage = React.useCallback(async () => {
    listControllerRef.current?.abort();
    const controller = new AbortController();
    listControllerRef.current = controller;
    setIsLoading(true);
    setListError(null);

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
      setItems(page.feedback);
      setTotal(page.total);
      setHasLoaded(true);
    } catch {
      if (controller.signal.aborted) return;
      setListError("Geri bildirim geçmişi şu anda yüklenemedi.");
    } finally {
      if (listControllerRef.current === controller) {
        listControllerRef.current = null;
        setIsLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const trimmedSubject = subject.trim();
  const trimmedMessage = message.trim();
  const canSubmit =
    trimmedSubject.length > 0 &&
    trimmedSubject.length <= SUBJECT_MAX &&
    trimmedMessage.length > 0 &&
    trimmedMessage.length <= MESSAGE_MAX &&
    !isSubmitting;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || submitControllerRef.current) return;

    const controller = new AbortController();
    submitControllerRef.current = controller;
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) throw new Error("feedback_session_unavailable");

      const created = await createSellerFeedback(
        accessToken,
        {
          category,
          subject: trimmedSubject,
          message: trimmedMessage,
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;

      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setTotal((current) => current + (itemsRef.current.some((item) => item.id === created.id) ? 0 : 1));
      setHasLoaded(true);
      setCategory("suggestion");
      setSubject("");
      setMessage("");
      setSubmitSuccess("Geri bildiriminiz gönderildi.");
      setExpandedId(created.id);
    } catch {
      if (controller.signal.aborted) return;
      setSubmitError(
        "Geri bildiriminiz şu anda gönderilemedi. Metniniz korundu; lütfen tekrar deneyin.",
      );
    } finally {
      if (submitControllerRef.current === controller) {
        submitControllerRef.current = null;
        setIsSubmitting(false);
      }
    }
  };

  const loadMore = async () => {
    if (isLoadingMore || itemsRef.current.length >= total) return;
    listControllerRef.current?.abort();
    const controller = new AbortController();
    listControllerRef.current = controller;
    setIsLoadingMore(true);
    setListError(null);

    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) throw new Error("feedback_session_unavailable");

      const page = await fetchSellerFeedbackList(accessToken, {
        limit: PAGE_SIZE,
        offset: itemsRef.current.length,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.feedback.filter((item) => !seen.has(item.id))];
      });
      setTotal(page.total);
    } catch {
      if (controller.signal.aborted) return;
      setListError("Daha fazla geri bildirim yüklenemedi.");
    } finally {
      if (listControllerRef.current === controller) {
        listControllerRef.current = null;
        setIsLoadingMore(false);
      }
    }
  };

  return (
    <section className="space-y-5" aria-labelledby="seller-feedback-title">
      <SectionHeader
        title="Geri Bildirim"
        description="Deneyiminizi, önerinizi veya karşılaştığınız bir sorunu bize iletin."
      />

      <form className="space-y-4" onSubmit={handleSubmit} aria-label="Geri bildirim gönderme formu">
        <div className="space-y-1.5">
          <label htmlFor="feedback-category" className="block type-meta font-medium text-muted-foreground">
            Kategori
          </label>
          <select
            id="feedback-category"
            name="category"
            value={category}
            disabled={isSubmitting}
            onChange={(event) => setCategory(event.target.value as SellerFeedbackCategory)}
            className={fieldClassName}
          >
            {SELLER_FEEDBACK_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {feedbackCategoryLabel(value)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="feedback-subject" className="block type-meta font-medium text-muted-foreground">
              Konu
            </label>
            <span className="type-meta text-muted-foreground" aria-hidden="true">
              {subject.length}/{SUBJECT_MAX}
            </span>
          </div>
          <input
            id="feedback-subject"
            name="subject"
            type="text"
            value={subject}
            maxLength={SUBJECT_MAX}
            disabled={isSubmitting}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Kısa bir başlık yazın"
            className={fieldClassName}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="feedback-message" className="block type-meta font-medium text-muted-foreground">
              Mesaj
            </label>
            <span className="type-meta text-muted-foreground" aria-hidden="true">
              {message.length}/{MESSAGE_MAX}
            </span>
          </div>
          <textarea
            id="feedback-message"
            name="message"
            rows={5}
            value={message}
            maxLength={MESSAGE_MAX}
            disabled={isSubmitting}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Detayları yazın"
            className={cn(fieldClassName, "min-h-[8.5rem] resize-y")}
          />
        </div>

        {submitSuccess ? (
          <p role="status" className="type-row-secondary text-foreground">
            {submitSuccess}
          </p>
        ) : null}
        {submitError ? (
          <p role="alert" className="type-row-secondary text-destructive">
            {submitError}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="md" disabled={!canSubmit} aria-busy={isSubmitting}>
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <Spinner size={14} label="Gönderiliyor" />
              <span>Gönderiliyor…</span>
            </span>
          ) : (
            "Gönder"
          )}
        </Button>
      </form>

      <div className="border-t border-divider pt-5">
        <div className="mb-3">
          <h3 className="type-body font-semibold text-foreground">Gönderdiklerim</h3>
          <p className="mt-1 type-row-secondary text-muted-foreground">
            Önceki geri bildirimlerinizin güncel durumunu takip edin.
          </p>
        </div>

        {isLoading && !hasLoaded ? (
          <div role="status" className="flex min-h-24 items-center gap-2 text-sm text-muted-foreground">
            <Spinner size={16} label="Geri bildirimler yükleniyor" />
            <span>Geri bildirimler yükleniyor…</span>
          </div>
        ) : null}

        {!isLoading && !hasLoaded && listError ? (
          <div className="space-y-3 py-4" role="status">
            <p className="type-row-secondary text-muted-foreground">{listError}</p>
            <Button type="button" variant="secondary" size="sm" onClick={loadFirstPage}>
              Tekrar dene
            </Button>
          </div>
        ) : null}

        {hasLoaded && items.length === 0 ? (
          <p role="status" className="py-4 type-row-secondary text-muted-foreground">
            Henüz gönderilmiş bir geri bildiriminiz yok.
          </p>
        ) : null}

        {items.length > 0 ? (
          <ul role="list" className="divide-y divide-divider border-y border-divider">
            {items.map((item) => {
              const expanded = expandedId === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    className="w-full px-1 py-3 text-left transition-colors hover:bg-raised/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate type-body font-medium text-foreground">{item.subject}</span>
                        <span className="mt-1 block type-meta text-muted-foreground">
                          {feedbackCategoryLabel(item.category)} · {formatFeedbackDate(item.createdAt)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 type-meta font-medium",
                          statusClassName(item.status),
                        )}
                      >
                        {feedbackStatusLabel(item.status)}
                      </span>
                    </span>
                  </button>

                  {expanded ? (
                    <div className="pb-4 pl-1 pr-1">
                      <p className="whitespace-pre-wrap type-row-secondary leading-relaxed text-muted-foreground">
                        {item.message}
                      </p>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 type-meta text-muted-foreground">
                        <div>
                          <dt className="font-medium text-foreground">Kategori</dt>
                          <dd>{feedbackCategoryLabel(item.category)}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-foreground">Durum</dt>
                          <dd>{feedbackStatusLabel(item.status)}</dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {hasLoaded && (items.length < total || listError) ? (
          <div className="pt-3">
            {listError ? (
              <p role="status" className="mb-2 type-row-secondary text-muted-foreground">
                {listError}
              </p>
            ) : null}
            {items.length < total ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={loadMore}
                disabled={isLoadingMore}
                aria-busy={isLoadingMore}
              >
                {isLoadingMore ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size={14} label="Daha fazla geri bildirim yükleniyor" />
                    <span>Yükleniyor…</span>
                  </span>
                ) : (
                  "Daha fazla göster"
                )}
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={loadFirstPage}>
                Yenile
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
