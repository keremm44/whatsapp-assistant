"use client";

import * as React from "react";

import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import {
  MarketingReveal,
  TrueFocusLine,
} from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";
import { StoryThreadMarker } from "@/components/marketing/story-thread";
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
    body: "Asistan bekler; bu konuşmanın yanıtlarını siz yönetirsiniz.",
    action: "Asistana bırak",
    next: "returned",
  },
  {
    id: "returned",
    tabLabel: "Asistana geri verin",
    stateLabel: "Asistan aktif",
    title: "Asistan yeniden devrede.",
    body: "Asistan yeni mesajlarda yeniden devreye girer.",
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

      <div className="mt-7 max-w-4xl border-l-2 border-boundary pl-5 sm:pl-6">
        <TrueFocusLine
          words={["Bilir.", "Cevaplar.", "Bilmezse durur.", "Size bırakır."]}
          className="font-heading text-[24px] font-semibold leading-9 tracking-[-0.015em] text-foreground sm:text-[32px] sm:leading-10"
        />
      </div>

      <MarketingReveal variant="product" className="mt-11">
        <ControlStage />
      </MarketingReveal>

      <CoralJourney />
    </section>
  );
}

function ControlStage() {
  const [stage, setStage] = React.useState<OwnershipStage>("assistant");
  const current =
    OWNERSHIP_STAGES.find((item) => item.id === stage) ?? OWNERSHIP_STAGES[0];
  const activeIndex = OWNERSHIP_STAGES.findIndex((item) => item.id === stage);

  return (
    <div className="overflow-hidden rounded-sheet border border-boundary bg-raised shadow-surface">
      <div
        role="group"
        aria-label="Örnek konuşma kontrolü"
        className="relative grid grid-rows-3 overflow-hidden border-b border-divider bg-chrome sm:grid-cols-3 sm:grid-rows-1"
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-chrome-hover transition-transform duration-200 ease-out motion-reduce:transition-none sm:inset-y-0 sm:left-0 sm:h-auto sm:w-1/3",
            activeIndex === 1 && "translate-y-full sm:translate-x-full sm:translate-y-0",
            activeIndex === 2 && "translate-y-[200%] sm:translate-x-[200%] sm:translate-y-0",
          )}
        />

        {OWNERSHIP_STAGES.map((item, index) => {
          const selected = item.id === stage;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setStage(item.id)}
              className={cn(
                "relative z-10 min-h-12 px-4 py-3.5 text-left text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:text-center",
                selected
                  ? "text-chrome-foreground"
                  : "text-chrome-foreground/60 hover:text-chrome-foreground",
              )}
            >
              <span className="mr-2 type-meta text-chrome-foreground/60">
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
              className="mt-7 inline-flex min-h-11 items-center self-start rounded-control bg-primary-button px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
            >
              {current.action}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStage("assistant")}
              className="mt-7 inline-flex min-h-11 items-center self-start rounded-control border border-boundary px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [visibleSteps, setVisibleSteps] = React.useState(4);

  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches || typeof IntersectionObserver === "undefined") return;

    const rect = node.getBoundingClientRect();
    const alreadyInViewport = rect.top < window.innerHeight && rect.bottom > 0;
    if (alreadyInViewport) return;

    setVisibleSteps(0);
    const timers: number[] = [];
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        [1, 2, 3, 4].forEach((step, index) => {
          timers.push(
            window.setTimeout(() => setVisibleSteps(step), index * 230),
          );
        });
      },
      { threshold: 0.28 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return (
    <div ref={rootRef} className="mt-14 border-y border-divider py-10 sm:mt-16 sm:py-12">
      <StoryThreadMarker
        step="02"
        label="Karar gereken yer"
        detail="Otomasyon burada durur; kayıt seller-attention durumuna geçer."
        className="mb-5 max-w-xl"
      />

      <div className="max-w-3xl">
        <p className="type-eyebrow text-muted-foreground">Karar gereken yerde</p>
        <h3 className="mt-3 font-display text-[32px] font-semibold leading-[38px] tracking-[-0.025em] text-foreground sm:text-[44px] sm:leading-[50px]">
          Durur. Konuyu size bırakır.
        </h3>
      </div>

      <div className="mt-8 overflow-hidden rounded-sheet border border-boundary bg-sunken shadow-surface">
        <div className="grid lg:grid-cols-4">
          <FlowStep index="01" label="Müşteri" visible={visibleSteps >= 1}>
            <ChatBubble from="customer">
              {MARKETING_STORY.returnQuestion}
            </ChatBubble>
          </FlowStep>

          <FlowStep index="02" label="Asistan durur" visible={visibleSteps >= 2}>
            <p className="type-meta font-semibold text-muted-foreground">
              Otomatik yanıt
            </p>
            <p className="mt-3 font-heading text-lg font-semibold text-foreground">
              Durur
            </p>
            <p className="mt-2 type-row-secondary text-muted">
              Müşteriye otomatik cevap gönderilmez.
            </p>
          </FlowStep>

          <FlowStep index="03" label="Durum" visible={visibleSteps >= 3}>
            <div className="flex min-h-[88px] items-center justify-center rounded-sheet border border-attention bg-attention-soft px-4 text-center">
              <p className="font-heading text-lg font-semibold text-attention">
                İade incelemesi
              </p>
            </div>
          </FlowStep>

          <FlowStep index="04" label="Siz görürsünüz" last visible={visibleSteps >= 4}>
            <div className="rounded-sheet border border-boundary bg-raised p-4">
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
  last = false,
  visible,
}: {
  index: string;
  label: string;
  children: React.ReactNode;
  last?: boolean;
  visible: boolean;
}) {
  return (
    <div
      className={cn(
        "relative px-5 py-6 transition-[opacity,transform] duration-300 sm:px-6",
        !last && "border-b border-divider lg:border-b-0 lg:border-r",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-35",
      )}
    >
      <div className="mb-5 flex items-center gap-2">
        <span className="relative z-10 flex h-7 min-w-7 items-center justify-center rounded-full border border-boundary bg-sunken px-1 type-meta font-semibold text-muted-foreground">
          {index}
        </span>
        <span className="type-meta font-semibold text-muted-foreground">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}
