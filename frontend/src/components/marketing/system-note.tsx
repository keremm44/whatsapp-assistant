import * as React from "react";

import { cn } from "@/lib/utils/cn";

type SystemNoteTone = "neutral" | "paused" | "attention";

const TONE_CLASSES: Record<SystemNoteTone, string> = {
  neutral: "border-l-boundary bg-recessed",
  paused: "border-l-paused bg-paused-muted",
  attention: "border-l-attention bg-attention-soft",
};

const LABEL_CLASSES: Record<SystemNoteTone, string> = {
  neutral: "text-muted-foreground",
  paused: "text-paused",
  attention: "text-attention",
};

export function SystemNote({
  children,
  tone = "neutral",
  label = "Sistem",
  className,
}: {
  children: React.ReactNode;
  tone?: SystemNoteTone;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-control border-l-[3px] px-3.5 py-3",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <p className={cn("type-meta font-semibold", LABEL_CLASSES[tone])}>{label}</p>
      <div className="mt-1 type-body text-foreground">{children}</div>
    </div>
  );
}
