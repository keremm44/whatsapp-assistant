import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Conversation transcript primitives for the marketing site, derived
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
          "max-w-[85%] rounded-[5px] px-3.5 py-2.5 text-foreground",
          isAssistant
            ? "border border-boundary bg-raised"
            : "border-l-2 border-boundary bg-sunken",
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

/**
 * A small honest annotation under a bubble ("what the system did"),
 * never a WhatsApp message. Aligned under whichever side it annotates.
 */
export function ChatNote({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <p
      className={cn(
        "type-meta text-muted-foreground",
        align === "right" && "text-right",
      )}
    >
      {children}
    </p>
  );
}

/**
 * A bounded product-evidence sheet — the marketing page's "work sheet"
 * grammar, reserved for proof artifacts rather than feature lists.
 */
export function ChatProofCard({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-sheet border border-boundary bg-raised shadow-surface",
        className,
      )}
    >
      <p className="flex items-center gap-1.5 border-b border-divider px-4 py-2.5 type-meta font-semibold text-muted-foreground">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
        />
        {label}
      </p>
      <div className="space-y-2.5 px-4 py-4">{children}</div>
    </div>
  );
}
