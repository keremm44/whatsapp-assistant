import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Conversation transcript primitives for the marketing site, derived
 * from the seller Conversations workbench (`message-timeline.tsx`).
 *
 * The two sides are separated by DEPTH, not by two competing tints:
 *
 *   incoming  → the customer's side, left, a SUNKEN block with a
 *               structural cue on its leading edge.
 *   outgoing  → the assistant's side, right, a NEUTRAL raised block.
 *               Cyan is a signal, not a material, so the bubble is
 *               never cyan-filled; only the "Asistan yanıtı" overline
 *               keeps the cyan accent (evidence-gated in the product,
 *               labelled here because these are assistant replies).
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
            ? "bg-selected"
            : "border-l-2 border-boundary bg-sunken",
        )}
      >
        {isAssistant ? (
          <p className="pb-0.5 type-meta font-semibold text-primary">
            Asistan yanıtı
          </p>
        ) : null}
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
 * One quiet material step above the canvas (raised) with a hairline
 * boundary edge and the soft sheet shadow.
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
        "overflow-hidden rounded-sheet border border-boundary/60 bg-raised shadow-surface",
        className,
      )}
    >
      <p className="flex items-center gap-1.5 border-b border-divider px-4 py-2.5 type-meta font-semibold text-muted-foreground">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-primary/70"
        />
        {label}
      </p>
      <div className="space-y-2.5 px-4 py-4">{children}</div>
    </div>
  );
}
