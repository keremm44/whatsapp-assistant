import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Conversation transcript primitive for the marketing site, derived
 * from the seller Conversations workbench (`message-timeline.tsx`).
 *
 * The two sides are separated by DEPTH, not by competing signal hues:
 *
 *   incoming  → customer's side, left, SUNKEN with a leading edge.
 *   outgoing  → assistant's side, right, one RAISED material step.
 *
 * Cyan stays reserved for interaction/focus/selection instead of being
 * spent as an "assistant colour". Speaker labels make the transcript
 * understandable without relying on alignment alone.
 */
export function ChatBubble({
  from,
  children,
}: {
  from: "customer" | "assistant";
  children: React.ReactNode;
}) {
  const isAssistant = from === "assistant";

  return (
    <div
      className={cn("flex w-full", isAssistant ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] px-3.5 py-2.5 text-[15px] leading-6 text-foreground",
          isAssistant
            ? "rounded-[14px_14px_4px_14px] border border-boundary/80 bg-raised shadow-1"
            : "rounded-[14px_14px_14px_4px] border-l-2 border-boundary bg-sunken",
        )}
      >
        {isAssistant ? (
          <p className="pb-0.5 type-meta font-semibold text-muted-foreground">
            Asistan yanıtı
          </p>
        ) : (
          <span className="sr-only">Müşteri: </span>
        )}
        {children}
      </div>
    </div>
  );
}
