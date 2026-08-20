import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Document transcript line — not a chat bubble.
 * Speaker is named in type; cyan is never spent as an assistant colour.
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
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-1 py-2.5">
      <p className="type-meta font-semibold text-muted-foreground">
        {isAssistant ? "Asistan" : "Müşteri"}
      </p>
      <div className={cn("text-[15px] leading-6 text-foreground")}>
        {isAssistant ? null : <span className="sr-only">Müşteri: </span>}
        {children}
      </div>
    </div>
  );
}
