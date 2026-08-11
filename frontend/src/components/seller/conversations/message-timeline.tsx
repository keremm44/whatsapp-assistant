"use client";

import * as React from "react";
import { Image as ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  fetchConversationDetail,
  type ConversationMessage,
  type ConversationMessagePage,
} from "@/lib/seller/conversations";
import {
  MEDIA_MESSAGE_LABEL,
  formatConversationTimestamp,
} from "@/lib/seller/conversations-format";
import { getBrowserAccessToken } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

/**
 * Message timeline — the operational work record of the selected
 * conversation.
 *
 * Ownership model (never overclaimed):
 *   incoming  → the customer's side, left, neutral surface-2 bubble.
 *   outgoing  → the outgoing side, right, a quiet petrol-derived
 *               bubble. The backend stores no seller-authored send
 *               path, so an outgoing bubble is NEVER labelled
 *               "Satıcı". When `was_auto_replied` is true the
 *               backend proves assistant authorship, and only then a
 *               small "Asistan" overline appears inside the bubble.
 *
 * What is deliberately absent (no backend contract exists for it):
 * read receipts, double ticks, delivery states, typing indicators,
 * online presence — and media thumbnails, because the read model
 * exposes `media_available`, never a media URL.
 *
 * Older messages: the "Daha eski mesajları yükle" control at the top
 * pages backwards with the real `before_message_id` cursor. When a
 * page is prepended, the scroll offset is restored by the exact
 * pixel delta so the visible window does not jump.
 *
 * Relative timestamps use the route's frozen `renderedAt` for
 * server-delivered messages (SSR/hydration identity) and `Date.now()`
 * for browser-fetched older pages (those render client-side only).
 */
export function MessageTimeline({
  customerId,
  initialMessages,
  initialMessagePage,
  renderedAt,
}: {
  customerId: number;
  initialMessages: ConversationMessage[];
  initialMessagePage: ConversationMessagePage;
  renderedAt: number;
}) {
  const [messages, setMessages] =
    React.useState<ConversationMessage[]>(initialMessages);
  const [messagePage, setMessagePage] =
    React.useState<ConversationMessagePage>(initialMessagePage);
  const [isLoadingOlder, setIsLoadingOlder] = React.useState(false);
  const [olderError, setOlderError] = React.useState<string | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const pendingScrollAdjustRef = React.useRef<number | null>(null);
  const prevHeightRef = React.useRef(0);

  // Re-seed when the server payload changes (navigation to another
  // conversation, or router.refresh() after a control handoff).
  React.useEffect(() => {
    setMessages(initialMessages);
    setMessagePage(initialMessagePage);
    setOlderError(null);
  }, [initialMessages, initialMessagePage]);

  React.useEffect(() => {
    return () => {
      inflightRef.current?.abort();
    };
  }, []);

  // On a conversation switch, land on the newest message (bottom).
  // The height containment only exists from md up; on mobile the
  // page scrolls naturally and the container is not scrollable, so
  // this is a harmless no-op there.
  React.useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [customerId]);

  // Restore the reading position after older messages are prepended.
  React.useLayoutEffect(() => {
    if (pendingScrollAdjustRef.current === null) return;
    const container = scrollRef.current;
    pendingScrollAdjustRef.current = null;
    if (!container) return;
    container.scrollTop += container.scrollHeight - prevHeightRef.current;
  }, [messages]);

  const onLoadOlder = async () => {
    const cursor = messagePage.nextBeforeMessageId;
    if (!messagePage.hasMore || cursor === null) return;
    if (isLoadingOlder || inflightRef.current) return;
    setOlderError(null);

    const container = scrollRef.current;
    prevHeightRef.current = container?.scrollHeight ?? 0;

    const controller = new AbortController();
    inflightRef.current = controller;
    setIsLoadingOlder(true);
    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        setOlderError(
          "Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.",
        );
        return;
      }
      const page = await fetchConversationDetail(accessToken, customerId, {
        beforeMessageId: cursor,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setMessages((previous) => {
        const seen = new Set(previous.map((message) => message.id));
        const older = page.messages.filter(
          (message) => !seen.has(message.id),
        );
        return [...older, ...previous];
      });
      setMessagePage(page.messagePage);
      // Flag the layout effect above to compensate the scroll offset
      // by the exact pixel height of the prepended page.
      pendingScrollAdjustRef.current = 1;
      // Older pages are fetched and rendered in the browser only, so
      // their relative timestamps may use the real current time.
      setOlderRenderedAt(Date.now());
    } catch {
      if (controller.signal.aborted) return;
      setOlderError(
        "Daha eski mesajlar şu anda yüklenemedi. Lütfen tekrar deneyin.",
      );
    } finally {
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      setIsLoadingOlder(false);
    }
  };

  // Server-delivered messages use the frozen route timestamp; pages
  // fetched in the browser use the fetch time. The initial seed uses
  // renderedAt for every message.
  const [olderRenderedAt, setOlderRenderedAt] = React.useState<number | null>(
    null,
  );

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-12 text-center">
        <p className="text-sm font-medium text-foreground">
          Bu konuşmada henüz mesaj yok
        </p>
        <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          Mesajlar geldiğinde konuşma geçmişi burada görünür.
        </p>
      </div>
    );
  }

  // The frozen server timestamp applies to initial messages; browser-
  // fetched older pages use their own fetch time. Because prepends
  // only ever ADD to the front, a message's relative anchor never
  // shifts underneath an already-rendered bubble.
  const initialIds = new Set(initialMessages.map((m) => m.id));

  return (
    <div
      ref={scrollRef}
      className="flex-1 space-y-2.5 px-0 py-4 md:min-h-0 md:overflow-y-auto md:px-4"
      aria-label="Mesaj geçmişi"
    >
      {messagePage.hasMore ? (
        <div className="flex justify-center pb-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onLoadOlder}
            disabled={isLoadingOlder}
            aria-busy={isLoadingOlder}
            className="text-muted-foreground"
          >
            {isLoadingOlder ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size={14} label="Yükleniyor" />
                <span>Yükleniyor…</span>
              </span>
            ) : (
              "Daha eski mesajları yükle"
            )}
          </Button>
        </div>
      ) : null}
      {olderError ? (
        <p role="alert" className="pb-1 text-center text-[12px] text-destructive">
          {olderError}
        </p>
      ) : null}

      <ol className="space-y-2.5">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            renderedAt={
              initialIds.has(message.id)
                ? renderedAt
                : (olderRenderedAt ?? renderedAt)
            }
          />
        ))}
      </ol>
    </div>
  );
}

/**
 * One message bubble. Compact and record-like, not a consumer-chat
 * clone: no avatar, no receipts, no decorative tails.
 */
function MessageBubble({
  message,
  renderedAt,
}: {
  message: ConversationMessage;
  renderedAt: number;
}) {
  const isIncoming = message.direction === "incoming";
  const timePhrase = formatConversationTimestamp(
    message.createdAt,
    renderedAt,
  );
  const hasText =
    typeof message.content === "string" && message.content.trim().length > 0;

  return (
    <li
      className={cn("flex", isIncoming ? "justify-start" : "justify-end")}
    >
      <div
        className={cn(
          "max-w-[88%] sm:max-w-[75%] md:max-w-[70%]",
          isIncoming ? "mr-auto" : "ml-auto",
        )}
      >
        <div
          className={cn(
            "rounded-lg px-3 py-2",
            isIncoming
              ? "border border-divider bg-surface-2 text-foreground"
              : "bg-primary-muted text-foreground",
          )}
        >
          {!isIncoming && message.wasAutoReplied ? (
            <p className="pb-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary-text">
              Asistan
            </p>
          ) : null}
          {message.mediaAvailable ? (
            <p
              className={cn(
                "flex items-center gap-1.5 text-[12px]",
                isIncoming ? "text-muted" : "text-primary-text/90",
                hasText ? "pb-1" : undefined,
              )}
            >
              <ImageIcon
                aria-hidden="true"
                size={14}
                strokeWidth={1.75}
              />
              <span>{MEDIA_MESSAGE_LABEL}</span>
            </p>
          ) : null}
          {hasText ? (
            <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">
              {message.content}
            </p>
          ) : null}
        </div>
        {timePhrase ? (
          <p
            className={cn(
              "mt-1 text-[10.5px] tabular-nums text-muted-foreground/80",
              isIncoming ? "text-left" : "text-right",
            )}
          >
            <time dateTime={message.createdAt} title={timePhrase}>
              {timePhrase}
            </time>
          </p>
        ) : null}
      </div>
    </li>
  );
}
