import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Conversation bubble primitives for the marketing site.
 *
 * These are static, honest proof artifacts — a bounded "work sheet" that
 * holds a short message exchange. Incoming (customer) bubbles sit on the
 * recessed material; outgoing (assistant) bubbles sit on the selected
 * petrol wash so the assistant's voice reads as "the product speaking".
 * No state colour is ever used here: type comes from the layout, never
 * from a hue.
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
      className={cn(
        "flex w-full",
        isAssistant ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-sheet px-3.5 py-2 type-body",
          isAssistant
            ? "bg-primary-muted text-foreground"
            : "bg-recessed text-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** A small honest annotation under a bubble ("what the system did"). */
export function ChatNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="type-meta text-muted-foreground">{children}</p>
  );
}

/**
 * A bounded conversation proof card — the marketing page's only "card"
 * grammar, reserved for product evidence rather than feature lists.
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
        "overflow-hidden rounded-sheet border border-boundary/60 bg-surface shadow-surface",
        className,
      )}
    >
      <p className="flex items-center gap-1.5 border-b border-divider px-4 py-2.5 type-meta font-semibold text-muted-foreground">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary/70" />
        {label}
      </p>
      <div className="space-y-2.5 px-4 py-4">{children}</div>
    </div>
  );
}
