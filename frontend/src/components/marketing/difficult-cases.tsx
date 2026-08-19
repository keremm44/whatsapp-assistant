import * as React from "react";

import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";
import { StatusChip } from "@/components/shared/status-chip";

/**
 * Difficult cases — a narrative product flow rather than three equal
 * dashboard cells. Neutral carries the customer/system path; coral begins
 * only when the backend meaning becomes genuine seller review.
 */
export function DifficultCases() {
  return (
    <section className="border-y border-divider bg-sunken">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-24 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Zor durumlar"
          title="Her şeyi çözmeye çalışmaz. Gerektiğinde durur."
          description="İade, sorun veya kayıtlı cevabı olmayan bir konu geldiğinde sınırını belli eder ve satıcı müdahalesini görünür hale getirir."
        />

        <MarketingReveal className="mt-12">
          <ReturnJourney />
        </MarketingReveal>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <MarketingReveal>
            <UnknownQuestionFlow />
          </MarketingReveal>
          <MarketingReveal>
            <SellerTakeoverFlow />
          </MarketingReveal>
        </div>
      </div>
    </section>
  );
}

function ReturnJourney() {
  return (
    <div className="overflow-hidden rounded-sheet border border-boundary/70 bg-raised shadow-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider bg-chrome/45 px-5 py-3.5 sm:px-6">
        <div>
          <p className="type-meta font-semibold text-chrome-foreground">Aynı konuşma · iade yolu</p>
          <p className="mt-0.5 type-meta text-chrome-foreground/55">{MARKETING_STORY.storeLabel}</p>
        </div>
        <StatusChip tone="attention">İade incelemesi</StatusChip>
      </div>

      <div className="relative grid gap-0 lg:grid-cols-[1.05fr_0.95fr_1fr]">
        <JourneyStage index="01" label="Müşteri">
          <ChatBubble from="customer">{MARKETING_STORY.returnQuestion}</ChatBubble>
          <p className="mt-4 type-meta text-muted-foreground">Konuşma normal biçimde başlar.</p>
        </JourneyStage>

        <JourneyStage index="02" label="Sistem" attention>
          <div className="rounded-sheet border border-attention/25 bg-attention-soft/55 p-4">
            <p className="type-meta font-semibold text-attention">Otomatik yanıt durdu</p>
            <p className="mt-2 type-body text-foreground">{MARKETING_STORY.returnSystemOutcome}</p>
          </div>
          <div className="mt-4 flex items-center gap-2" aria-hidden="true">
            <span className="h-1.5 w-1.5 rounded-full bg-attention" />
            <span className="h-px flex-1 bg-attention/55" />
            <span className="type-meta font-semibold text-attention">seller review</span>
          </div>
        </JourneyStage>

        <JourneyStage index="03" label="Satıcı görünürlüğü" attention last>
          <div className="rounded-sheet border border-boundary/60 bg-sunken p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="type-row-primary text-foreground">İade incelemesi</p>
              <StatusChip tone="attention">İncelemeniz gerekiyor</StatusChip>
            </div>
            <p className="mt-3 type-row-secondary text-muted">{MARKETING_STORY.returnQuestion}</p>
          </div>
          <p className="mt-4 type-meta text-muted-foreground">
            Aynı olay artık satıcının öncelikli çalışma yüzeyinde görünür.
          </p>
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

function UnknownQuestionFlow() {
  return (
    <div className="h-full rounded-sheet border border-boundary/60 bg-raised p-5 shadow-surface sm:p-6">
      <p className="type-meta font-semibold text-muted-foreground">Bilinmeyen soru</p>
      <h3 className="mt-2 font-heading text-lg font-semibold text-foreground">Cevabı yoksa yeni bir kural uydurmaz.</h3>

      <div className="mt-5 space-y-3">
        <ChatBubble from="customer">{MARKETING_STORY.unknownQuestion}</ChatBubble>
        <ChatBubble from="assistant">{MARKETING_STORY.unknownAnswer}</ChatBubble>
        <div className="flex items-center gap-3 rounded-control border border-boundary bg-recessed px-3.5 py-3">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />
          <div>
            <p className="type-meta font-semibold text-foreground">Cevaplanamayan sorulara eklendi</p>
            <p className="mt-0.5 type-meta text-muted-foreground">Seller review alarmı değil; sakin bir takip kaydıdır.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SellerTakeoverFlow() {
  return (
    <div className="h-full rounded-sheet border border-boundary/60 bg-raised p-5 shadow-surface sm:p-6">
      <p className="type-meta font-semibold text-muted-foreground">Satıcı devralması</p>
      <h3 className="mt-2 font-heading text-lg font-semibold text-foreground">Siz girdiğinizde asistan araya girmez.</h3>

      <div className="mt-5 rounded-sheet border border-boundary/60 bg-sunken p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-control bg-recessed px-2.5 type-meta font-semibold text-foreground">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
            Asistan aktif
          </span>
          <span className="rounded-control bg-primary-button px-3 py-1.5 text-sm font-medium text-primary-foreground">
            Ben ilgileneceğim
          </span>
        </div>

        <div className="my-4 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-divider" />
          <span className="type-meta font-semibold text-primary">kontrol devri</span>
          <span className="h-px flex-1 bg-primary/45" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-control bg-recessed px-2.5 type-meta font-semibold text-foreground">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
            Siz ilgileniyorsunuz
          </span>
          <p className="type-meta text-muted-foreground">Asistan bekler.</p>
        </div>
      </div>
    </div>
  );
}
