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
import {
  assignMessageTimestampAnchors,
  isActiveTimelineLoad,
  reconcileConversationTimeline,
} from "@/lib/seller/conversations-timeline";
import {
  getBrowserAccessToken,
  subscribeToMessageInserts,
} from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

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
  const [timestampAnchors, setTimestampAnchors] = React.useState<
    Map<number, number>
  >(() => {
    const initial = new Map<number, number>();
    for (const message of initialMessages) {
      initial.set(message.id, renderedAt);
    }
    return initial;
  });

  const inflightRef = React.useRef<AbortController | null>(null);
  const realtimeInflightRef = React.useRef<AbortController | null>(null);
  const realtimePendingRef = React.useRef(false);
  const loadGenerationRef = React.useRef(0);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const pendingScrollAdjustRef = React.useRef<number | null>(null);
  const pendingResetScrollRef = React.useRef(false);
  const prevHeightRef = React.useRef(0);
  const customerIdRef = React.useRef(customerId);
  const messagesRef = React.useRef(messages);
  messagesRef.current = messages;
  const messagePageRef = React.useRef(messagePage);
  messagePageRef.current = messagePage;

  React.useLayoutEffect(() => {
    loadGenerationRef.current += 1;
    inflightRef.current?.abort();
    inflightRef.current = null;
    pendingScrollAdjustRef.current = null;
    prevHeightRef.current = 0;
    setIsLoadingOlder(false);

    const result = reconcileConversationTimeline({
      previousCustomerId: customerIdRef.current,
      nextCustomerId: customerId,
      previousMessages: messagesRef.current,
      nextMessages: initialMessages,
      previousMessagePage: messagePageRef.current,
      nextMessagePage: initialMessagePage,
    });
    setMessages(result.messages);
    setMessagePage(result.messagePage);
    setTimestampAnchors((previous) =>
      assignMessageTimestampAnchors({
        previousCustomerId: customerIdRef.current,
        nextCustomerId: customerId,
        previousAnchors: previous,
        messageIds: result.messages.map((message) => message.id),
        serverMessageIds: new Set(initialMessages.map((message) => message.id)),
        serverRenderedAt: renderedAt,
        fetchRenderedAt: renderedAt,
      }),
    );
    if (result.didReset) {
      setOlderError(null);
      pendingResetScrollRef.current = true;
    }
    customerIdRef.current = customerId;
  }, [customerId, initialMessages, initialMessagePage, renderedAt]);

  React.useEffect(() => {
    return () => {
      inflightRef.current?.abort();
      realtimeInflightRef.current?.abort();
    };
  }, []);

  React.useEffect(() => {
    let active = true;

    const refreshLatest = async (): Promise<void> => {
      if (!active) return;
      if (realtimeInflightRef.current !== null) {
        realtimePendingRef.current = true;
        return;
      }

      const controller = new AbortController();
      realtimeInflightRef.current = controller;
      try {
        const accessToken = await getBrowserAccessToken();
        if (!active || controller.signal.aborted || !accessToken) return;

        const page = await fetchConversationDetail(accessToken, customerId, {
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted) return;

        const fetchedAt = Date.now();
        const result = reconcileConversationTimeline({
          previousCustomerId: customerId,
          nextCustomerId: customerId,
          previousMessages: messagesRef.current,
          nextMessages: page.messages,
          previousMessagePage: messagePageRef.current,
          nextMessagePage: page.messagePage,
        });

        setMessages(result.messages);
        setMessagePage(result.messagePage);
        setTimestampAnchors((previous) =>
          assignMessageTimestampAnchors({
            previousCustomerId: customerId,
            nextCustomerId: customerId,
            previousAnchors: previous,
            messageIds: result.messages.map((message) => message.id),
            serverMessageIds: new Set(page.messages.map((message) => message.id)),
            serverRenderedAt: fetchedAt,
            fetchRenderedAt: fetchedAt,
          }),
        );
        if (result.didReset) {
          pendingResetScrollRef.current = true;
        }
      } catch {
        // Realtime is an enhancement. Keep the last valid timeline if the
        // authenticated refresh fails transiently.
      } finally {
        if (realtimeInflightRef.current === controller) {
          realtimeInflightRef.current = null;
        }
        if (active && realtimePendingRef.current) {
          realtimePendingRef.current = false;
          void refreshLatest();
        }
      }
    };

    const unsubscribe = subscribeToMessageInserts(() => {
      void refreshLatest();
    });

    return () => {
      active = false;
      realtimePendingRef.current = false;
      realtimeInflightRef.current?.abort();
      realtimeInflightRef.current = null;
      unsubscribe();
    };
  }, [customerId]);

  React.useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [customerId]);

  React.useLayoutEffect(() => {
    const container = scrollRef.current;
    if (pendingResetScrollRef.current) {
      pendingResetScrollRef.current = false;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
      return;
    }
    if (pendingScrollAdjustRef.current === null) return;
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

    const startedGeneration = loadGenerationRef.current;
    const controller = new AbortController();
    inflightRef.current = controller;
    setIsLoadingOlder(true);
    const isCurrent = () =>
      isActiveTimelineLoad({
        startedGeneration,
        currentGeneration: loadGenerationRef.current,
        aborted: controller.signal.aborted,
      });
    try {
      const accessToken = await getBrowserAccessToken();
      if (!isCurrent()) return;
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
      if (!isCurrent()) return;
      const fetchRenderedAt = Date.now();
      const previousMessages = messagesRef.current;
      const seen = new Set(previousMessages.map((message) => message.id));
      const older = page.messages.filter((message) => !seen.has(message.id));
      const nextMessages = [...older, ...previousMessages];
      setMessages(nextMessages);
      setTimestampAnchors((previousAnchors) =>
        assignMessageTimestampAnchors({
          previousCustomerId: customerId,
          nextCustomerId: customerId,
          previousAnchors,
          messageIds: nextMessages.map((message) => message.id),
          serverMessageIds: new Set(),
          serverRenderedAt: renderedAt,
          fetchRenderedAt,
        }),
      );
      setMessagePage(page.messagePage);
      pendingScrollAdjustRef.current = 1;
    } catch {
      if (!isCurrent()) return;
      setOlderError(
        "Daha eski mesajlar şu anda yüklenemedi. Lütfen tekrar deneyin.",
      );
    } finally {
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
      if (isCurrent()) {
        setIsLoadingOlder(false);
      }
    }
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-12 text-center">
        <p className="type-row-primary text-foreground">
          Bu WhatsApp konuşmasında henüz mesaj yok
        </p>
        <p className="max-w-sm type-body text-muted">
          Mesajlar geldiğinde konuşma geçmişi burada görünür.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="scrollbar-quiet flex-1 px-0 py-5 md:min-h-0 md:overflow-y-auto md:px-6"
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
        <p role="alert" className="pb-1 text-center type-meta text-destructive">
          {olderError}
        </p>
      ) : null}

      <ol className="space-y-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            renderedAt={timestampAnchors.get(message.id) ?? renderedAt}
          />
        ))}
      </ol>
    </div>
  );
}

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
          "max-w-[92%] sm:max-w-[78%] md:max-w-[72%]",
          isIncoming ? "mr-auto" : "ml-auto",
        )}
      >
        <div
          className={cn(
            "rounded-[5px] px-3.5 py-2.5 text-foreground",
            isIncoming
              ? "border-l-2 border-boundary bg-sunken"
              : "bg-selected",
          )}
        >
          {!isIncoming && message.wasAutoReplied ? (
            <p className="pb-0.5 type-meta font-semibold text-primary">
              Asistan yanıtı
            </p>
          ) : null}
          {message.mediaAvailable ? (
            <p
              className={cn(
                "flex items-center gap-1.5 type-meta text-muted",
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
            <p className="whitespace-pre-wrap break-words type-body">
              {message.content}
            </p>
          ) : null}
        </div>
        {timePhrase ? (
          <p
            className={cn(
              "mt-1 type-meta type-figure text-muted-foreground",
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
