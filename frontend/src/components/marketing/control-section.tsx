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
      className="mx-auto w-full max-w-[720px] scroll-mt-20 px-5 py-8 md:py-10"
    >
      <h2 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.022em] text-foreground">
        Konuşmayı istediğiniz anda devralırsınız.
      </h2>
      <p className="mt-4 type-body text-muted">
        Asistan rutin konuşmayı yürütür. Siz devraldığınız anda bekler; işiniz
        bittiğinde aynı konuşmayı yeniden asistana bırakabilirsiniz.
      </p>

      <div className="mt-8">
        <ControlStage />
      </div>
    </section>
  );
}

function ControlStage() {
  const [stage, setStage] = React.useState<OwnershipStage>("assistant");
  const current =
    OWNERSHIP_STAGES.find((item) => item.id === stage) ?? OWNERSHIP_STAGES[0];

  return (
    <div>
      <div
        role="group"
        aria-label="Örnek konuşma kontrolü"
        className="flex flex-wrap gap-2"
      >
        {OWNERSHIP_STAGES.map((item) => {
          const selected = item.id === stage;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setStage(item.id)}
              className={cn(
                "inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                selected
                  ? "bg-raised text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.tabLabel}
            </button>
          );
        })}
      </div>

      <div className="mt-6 border-y border-divider py-4">
        <ChatBubble from="customer">{MARKETING_STORY.customerQuestion}</ChatBubble>
        {stage === "seller" ? (
          <p className="mt-3 type-body text-muted">
            Asistan bu konuşmaya yeni yanıt göndermez.
          </p>
        ) : (
          <div className="border-t border-divider">
            <ChatBubble from="assistant">{MARKETING_STORY.assistantAnswer}</ChatBubble>
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="font-heading text-lg font-semibold text-foreground">
          {current.title}
        </h3>
        <p className="mt-2 type-body text-muted">{current.body}</p>

        {current.action && current.next ? (
          <button
            type="button"
            onClick={() => setStage(current.next!)}
            className="mt-5 inline-flex min-h-11 items-center rounded-control bg-primary-button px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            {current.action}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStage("assistant")}
            className="mt-5 inline-flex min-h-11 items-center rounded-control px-4 py-2.5 text-sm font-medium text-foreground underline decoration-divider underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Tekrar göster
          </button>
        )}
      </div>
    </div>
  );
}
