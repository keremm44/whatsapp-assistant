"use client";

import * as React from "react";

import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";
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
      className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-4 py-12 md:px-6 md:py-16 lg:px-8"
    >
      <div className="grid gap-7 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:items-end md:gap-12">
        <div>
          <p className="type-eyebrow text-muted-foreground">Kontrol</p>
          <h2 className="mt-3 font-display text-[34px] font-semibold leading-[40px] tracking-[-0.025em] text-foreground sm:text-[46px] sm:leading-[52px]">
            Konuşmayı istediğiniz anda devralırsınız.
          </h2>
        </div>
        <div>
          <p className="max-w-2xl type-body text-muted">
            Asistan rutin konuşmayı yürütür. Siz devraldığınız anda bekler; işiniz
            bittiğinde aynı konuşmayı yeniden asistana bırakabilirsiniz.
          </p>
        </div>
      </div>

      <div className="mt-10">
        <ControlStage />
      </div>
    </section>
  );
}

function ControlStage() {
  const [stage, setStage] = React.useState<OwnershipStage>("assistant");
  const current =
    OWNERSHIP_STAGES.find((item) => item.id === stage) ?? OWNERSHIP_STAGES[0];
  const activeIndex = OWNERSHIP_STAGES.findIndex((item) => item.id === stage);

  return (
    <div className="overflow-hidden rounded-sheet border border-boundary bg-raised shadow-2">
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

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="border-b border-divider bg-sunken px-4 py-6 sm:px-6 sm:py-7 lg:border-b-0 lg:border-r">
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
            <ChatBubble from="customer">{MARKETING_STORY.customerQuestion}</ChatBubble>
            {stage === "seller" ? (
              <div className="ml-auto max-w-[85%] rounded-[5px] border border-boundary bg-recessed px-3.5 py-3">
                <p className="type-meta font-semibold text-muted-foreground">Kontrol sizde</p>
                <p className="mt-1 type-body text-foreground">
                  Asistan bu konuşmaya yeni yanıt göndermez.
                </p>
              </div>
            ) : (
              <ChatBubble from="assistant">{MARKETING_STORY.assistantAnswer}</ChatBubble>
            )}
          </div>
        </div>

        <div className="flex min-h-[220px] flex-col justify-between px-5 py-6 sm:px-6">
          <div>
            <h3 className="font-heading text-xl font-semibold leading-7 text-foreground">
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
