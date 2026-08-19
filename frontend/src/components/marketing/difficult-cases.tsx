import * as React from "react";

import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";
import { StatusChip } from "@/components/shared/status-chip";

/**
 * Difficult cases — one concise exception path. The seller has already
 * seen ownership in Control and can try unknown/return branches in Demo,
 * so this section only proves the key boundary: the assistant stops and
 * turns a sensitive case into visible seller work.
 */
export function DifficultCases() {
  return (
    <section className="border-y border-divider bg-sunken">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-24 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Zor durumlar"
          title="Gerektiğinde durur ve sizi devreye alır."
          description="İade gibi satıcı kararı isteyen bir durumda konuşmayı kendi başına çözmeye çalışmaz."
        />

        <MarketingReveal className="mt-10">
          <ReturnJourney />
        </MarketingReveal>
      </div>
    </section>
  );
}

function ReturnJourney() {
  return (
    <div className="overflow-hidden rounded-sheet border border-boundary/70 bg-raised shadow-surface">
      <div className="grid lg:grid-cols-[1.05fr_0.9fr_1fr]">
        <JourneyStage index="01" label="Müşteri">
          <ChatBubble from="customer">{MARKETING_STORY.returnQuestion}</ChatBubble>
        </JourneyStage>

        <JourneyStage index="02" label="Asistan durur" attention>
          <div className="rounded-sheet border border-attention/25 bg-attention-soft/55 p-4">
            <p className="type-meta font-semibold text-attention">Otomatik yanıt durdu</p>
            <p className="mt-2 type-body text-foreground">Konuşma iade incelemesine geçer.</p>
          </div>
        </JourneyStage>

        <JourneyStage index="03" label="Size düşer" attention last>
          <div className="rounded-sheet border border-boundary/60 bg-sunken p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="type-row-primary text-foreground">İade incelemesi</p>
              <StatusChip tone="attention">İncelemeniz gerekiyor</StatusChip>
            </div>
            <p className="mt-3 type-row-secondary text-muted">{MARKETING_STORY.returnQuestion}</p>
          </div>
        </JourneyStage>
      </div>
    </div>
  );
}

function JourneyStage({
  index,
  label,
  children,
  attention = false,
  last = false,
}: {
  index: string;
  label: string;
  children: React.ReactNode;
  attention?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={
        last
          ? "relative px-5 py-6 sm:px-6 lg:py-7"
          : "relative border-b border-divider px-5 py-6 sm:px-6 lg:border-b-0 lg:border-r lg:py-7"
      }
    >
      <div className="mb-5 flex items-center gap-2">
        <span className={attention ? "type-meta font-semibold text-attention" : "type-meta font-semibold text-muted-foreground"}>
          {index}
        </span>
        <span className={attention ? "h-px w-6 bg-attention/55" : "h-px w-6 bg-divider"} />
        <span className={attention ? "type-meta font-semibold text-attention" : "type-meta font-semibold text-foreground"}>
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}
