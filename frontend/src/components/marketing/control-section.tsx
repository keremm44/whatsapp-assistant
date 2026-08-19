"use client";

import * as React from "react";

import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import {
  MarketingReveal,
  TrueFocusLine,
} from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";
import { StatusChip } from "@/components/shared/status-chip";
import { cn } from "@/lib/utils/cn";

type OwnershipStage = "assistant" | "seller" | "returned";

const OWNERSHIP_STAGES: Array<{
  id: OwnershipStage;
  tabLabel: string;
  stateLabel: string;
  title: string;
  body: string;
  action?: string;
  next?: OwnershipStage;
}> = [
  {
    id: "assistant",
    tabLabel: "Asistan aktif",
    stateLabel: "Asistan aktif",
    title: "Asistan konuşuyor.",
    body: "Kayıtlı bilgilerinizle müşteriye yanıt verir.",
    action: "Ben ilgileneceğim",
    next: "seller",
  },
  {
    id: "seller",
    tabLabel: "Siz ilgileniyorsunuz",
    stateLabel: "Siz ilgileniyorsunuz",
    title: "Kontrol sizde.",
    body: "Siz konuşurken asistan araya girmez.",
    action: "Asistana bırak",
    next: "returned",
  },
  {
    id: "returned",
    tabLabel: "Asistana geri verin",
    stateLabel: "Asistan aktif",
    title: "Asistan yeniden devrede.",
    body: "Yeni mesajlarda kaldığı yerden devam eder.",
  },
];

export function ControlSection() {
  return (
    <section
      id="kontrol"
      className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-4 py-16 md:px-6 md:py-24 lg:px-8"
    >
      <MarketingSectionHeading
        eyebrow="Kontrol"
        title="Konuşmayı istediğiniz anda devralırsınız."
        description="Asistan rutin konuşmayı yürütür. Karar gerçekten size ait olduğunda durur; siz devralabilir, işiniz bittiğinde yeniden asistana bırakabilirsiniz."
      />

      <div className="mt-7 max-w-4xl border-l-2 border-primary/55 pl-5 sm:pl-6">
        <TrueFocusLine
          words={["Bilir.", "Cevaplar.", "Bilmezse durur.", "Size bırakır."]}
          className="font-heading text-[24px] font-semibold leading-9 tracking-[-0.015em] text-foreground sm:text-[32px] sm:leading-10"
        />
      </div>

      <MarketingReveal className="mt-11">
        <ControlStage />
      </MarketingReveal>

      <MarketingReveal className="mt-16">
        <CoralJourney />
      </MarketingReveal>
    </section>
  );
}

function ControlStage() {
  const [stage, setStage] = React.useState<OwnershipStage>("assistant");
  const current =
    OWNERSHIP_STAGES.find((item) => item.id === stage) ?? OWNERSHIP_STAGES[0];
  const activeIndex = OWNERSHIP_STAGES.findIndex((item) => item.id === stage);

  return (
    <div className="overflow-hidden rounded-sheet border border-boundary/70 bg-raised shadow-surface">
      <div
        role="tablist"
        aria-label="Örnek konuşma kontrolü"
        className="relative grid border-b border-divider bg-chrome/45 sm:grid-cols-3"
      >
        {OWNERSHIP_STAGES.map((item, index) => {
          const selected = item.id === stage;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setStage(item.id)}
              className={cn(
                "relative px-4 py-3.5 text-left text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:text-center",
                selected
                  ? "bg-chrome-hover text-chrome-foreground"
                  : "text-chrome-foreground/58 hover:bg-chrome-hover/50 hover:text-chrome-foreground/85",
              )}
            >
              <span className="mr-2 type-meta text-chrome-foreground/40">
                0{index + 1}
              </span>
              {item.tabLabel}
              {selected ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-primary"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="border-b border-divider bg-sunken px-4 py-5 sm:px-6 sm:py-6 lg:border-b-0 lg:border-r">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="type-meta font-semibold text-foreground">
              {MARKETING_STORY.storeLabel}
            </p>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-control bg-recessed px-2.5 type-meta font-semibold text-foreground">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
              />
              {current.stateLabel}
            </span>
          </div>

          <div className="space-y-3">
            <ChatBubble from="customer">
              {MARKETING_STORY.customerQuestion}
            </ChatBubble>
            {stage === "seller" ? (
              <div className="ml-auto max-w-[85%] rounded-[5px] border border-boundary bg-recessed px-3.5 py-3">
                <p className="type-meta font-semibold text-muted-foreground">
                  Kontrol sizde
                </p>
                <p className="mt-1 type-body text-foreground">
                  Asistan bu konuşmaya yeni yanıt göndermez.
                </p>
              </div>
            ) : (
              <ChatBubble from="assistant">
                {MARKETING_STORY.assistantAnswer}
              </ChatBubble>
            )}
          </div>
        </div>

        <div className="flex min-h-[240px] flex-col justify-between px-5 py-6 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="type-meta font-semibold text-primary">
                0{activeIndex + 1}
              </span>
              <span aria-hidden="true" className="h-px flex-1 bg-divider" />
            </div>
            <h3 className="mt-5 font-heading text-xl font-semibold leading-7 text-foreground">
              {current.title}
            </h3>
            <p className="mt-2 type-body text-muted">{current.body}</p>
          </div>

          {current.action && current.next ? (
            <button
              type="button"
              onClick={() => setStage(current.next!)}
              className="mt-7 inline-flex self-start rounded-control bg-primary-button px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
            >
              {current.action}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStage("assistant")}
              className="mt-7 inline-flex self-start rounded-control border border-boundary px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-hover/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Tekrar göster
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CoralJourney() {
  return (
    <div className="border-y border-divider py-10 sm:py-12">
      <div className="max-w-3xl">
        <p className="type-eyebrow text-attention">Karar gereken an</p>
        <h3 className="mt-3 font-display text-[32px] font-semibold leading-[38px] tracking-[-0.025em] text-foreground sm:text-[44px] sm:leading-[50px]">
          Her şeyi çözmeye çalışmaz.
        </h3>
        <p className="mt-3 max-w-2xl text-base leading-7 text-foreground/78">
          İade gibi sizin kararınızı isteyen bir mesaj geldiğinde otomatik yanıtı durdurur ve konuyu görünür biçimde size bırakır.
        </p>
      </div>

      <div className="relative mt-8 overflow-hidden rounded-sheet border border-boundary/70 bg-sunken shadow-surface">
        <div
          aria-hidden="true"
          className="absolute left-[16%] right-[16%] top-[42px] hidden h-px bg-gradient-to-r from-divider via-attention/60 to-attention/80 lg:block"
        />
        <div className="relative grid lg:grid-cols-4">
          <FlowStep index="01" label="Müşteri">
            <ChatBubble from="customer">
              {MARKETING_STORY.returnQuestion}
            </ChatBubble>
          </FlowStep>

          <FlowStep index="02" label="Asistan durur" attention>
            <p className="font-heading text-lg font-semibold text-foreground">
              Otomatik yanıt durdu
            </p>
            <p className="mt-2 type-row-secondary text-muted">
              Müşteriye otomatik cevap gönderilmez.
            </p>
          </FlowStep>

          <FlowStep index="03" label="Durum" attention>
            <div className="flex min-h-[88px] items-center justify-center rounded-sheet border border-attention/25 bg-attention-soft/55 px-4 text-center">
              <p className="font-heading text-lg font-semibold text-attention">
                İade incelemesi
              </p>
            </div>
          </FlowStep>

          <FlowStep index="04" label="Siz görürsünüz" attention last>
            <div className="rounded-sheet border border-boundary/60 bg-raised p-4">
              <StatusChip tone="attention">İncelemeniz gerekiyor</StatusChip>
              <p className="mt-3 type-row-secondary text-foreground">
                {MARKETING_STORY.returnQuestion}
              </p>
            </div>
          </FlowStep>
        </div>
      </div>
    </div>
  );
}

function FlowStep({
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
      className={cn(
        "relative px-5 py-6 sm:px-6",
        !last && "border-b border-divider lg:border-b-0 lg:border-r",
      )}
    >
      <div className="mb-5 flex items-center gap-2">
        <span
          className={cn(
            "relative z-10 flex h-7 min-w-7 items-center justify-center rounded-full border bg-sunken px-1 type-meta font-semibold",
            attention
              ? "border-attention/40 text-attention"
              : "border-boundary text-muted-foreground",
          )}
        >
          {index}
        </span>
        <span
          className={
            attention
              ? "type-meta font-semibold text-attention"
              : "type-meta font-semibold text-foreground"
          }
        >
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}
