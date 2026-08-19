"use client";

import * as React from "react";

import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal, TrueFocusLine } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";
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
    title: "Kayıtlı bilgilerle konuşur.",
    body: "Müşterinin sorusuna işletmenizin verdiği bilgi ve kurallarla yanıt verir.",
    action: "Ben ilgileneceğim",
    next: "seller",
  },
  {
    id: "seller",
    tabLabel: "Siz ilgileniyorsunuz",
    stateLabel: "Siz ilgileniyorsunuz",
    title: "Asistan konuşmaya yeni yanıt göndermez.",
    body: "Konuşma sizde kaldığı sürece asistan bekler; müşteriye vereceğiniz yanıtı bölmez.",
    action: "Asistana bırak",
    next: "returned",
  },
  {
    id: "returned",
    tabLabel: "Asistana geri verin",
    stateLabel: "Asistan aktif",
    title: "Aynı konuşma bağlamıyla devam eder.",
    body: "Konuşmayı geri verdiğinizde asistan yeni mesajlarda yeniden devreye girer.",
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
        description="Asistan yalnızca verdiğiniz bilgilerle ilerler. Karar sizdeyse konuşmayı size bırakır; işiniz bittiğinde aynı yerden asistana geri verirsiniz."
      />

      <div className="mt-7 max-w-4xl border-l-2 border-primary/55 pl-5 sm:pl-6">
        <TrueFocusLine
          words={["Bilir.", "Cevaplar.", "Bilmezse durur.", "Size bırakır."]}
          className="font-heading text-[22px] font-semibold leading-9 tracking-[-0.015em] text-foreground sm:text-[28px] sm:leading-10"
        />
      </div>

      <MarketingReveal className="mt-11">
        <ControlStage />
      </MarketingReveal>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        <PrincipleCard kind="source" />
        <PrincipleCard kind="unknown" />
        <PrincipleCard kind="handoff" />
      </div>
    </section>
  );
}

function ControlStage() {
  const [stage, setStage] = React.useState<OwnershipStage>("assistant");
  const current = OWNERSHIP_STAGES.find((item) => item.id === stage) ?? OWNERSHIP_STAGES[0];
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
              <span className="mr-2 type-meta text-chrome-foreground/40">0{index + 1}</span>
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
        <div className="border-b border-divider bg-sunken px-4 py-5 sm:px-6 sm:py-6 lg:border-b-0 lg:border-r">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="type-meta font-semibold text-foreground">{MARKETING_STORY.storeLabel}</p>
              <p className="mt-0.5 type-meta text-muted-foreground">Aynı konuşma · örnek kontrol yüzeyi</p>
            </div>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-control bg-recessed px-2.5 type-meta font-semibold text-foreground">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              {current.stateLabel}
            </span>
          </div>

          <div className="space-y-3">
            <ChatBubble from="customer">{MARKETING_STORY.customerQuestion}</ChatBubble>
            {stage === "seller" ? (
              <div className="ml-auto max-w-[85%] rounded-[5px] border border-boundary bg-recessed px-3.5 py-3">
                <p className="type-meta font-semibold text-muted-foreground">Kontrol sizde</p>
                <p className="mt-1 type-body text-foreground">Asistan bu konuşmaya yeni yanıt göndermez.</p>
              </div>
            ) : (
              <ChatBubble from="assistant">{MARKETING_STORY.assistantAnswer}</ChatBubble>
            )}
          </div>
        </div>

        <div className="flex min-h-[260px] flex-col justify-between px-5 py-6 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="type-meta font-semibold text-primary">0{activeIndex + 1}</span>
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
              Baştan görün
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PrincipleCard({ kind }: { kind: "source" | "unknown" | "handoff" }) {
  const content = {
    source: {
      title: "Bilgi sizden gelir",
      body: "Ürünleriniz, kurallarınız ve kayıtlı cevaplarınız asistanın işletme bilgisini oluşturur.",
    },
    unknown: {
      title: "Bilinmeyen soru kaybolmaz",
      body: "Kayıtlı cevap yoksa yeni kural uydurmaz; soruyu cevaplanamayan sorular listesine taşır.",
    },
    handoff: {
      title: "Devralma görünürdür",
      body: "Konuşmayla kimin ilgilendiği aynı kontrol yüzeyinde açıkça görünür.",
    },
  }[kind];

  return (
    <MarketingReveal>
      <div className="group h-full rounded-sheet border border-boundary/60 bg-raised p-5 shadow-surface transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-hover/20">
        <PrincipleDiagram kind={kind} />
        <h3 className="mt-5 type-row-primary text-foreground">{content.title}</h3>
        <p className="mt-1.5 type-body text-muted">{content.body}</p>
      </div>
    </MarketingReveal>
  );
}

function PrincipleDiagram({ kind }: { kind: "source" | "unknown" | "handoff" }) {
  if (kind === "source") {
    return (
      <div className="grid grid-cols-[1fr_34px_1fr] items-center gap-2" aria-hidden="true">
        <div className="space-y-1.5">
          {['Ürünler', 'Kurallar', 'Cevaplar'].map((label) => (
            <span key={label} className="block rounded-control bg-recessed px-2.5 py-1.5 type-meta text-muted-foreground">
              {label}
            </span>
          ))}
        </div>
        <span className="h-px bg-primary/45" />
        <span className="rounded-sheet border border-primary/25 bg-selected/55 px-3 py-4 text-center type-meta font-semibold text-primary">
          Asistan
        </span>
      </div>
    );
  }

  if (kind === "unknown") {
    return (
      <div className="space-y-2" aria-hidden="true">
        <span className="block rounded-control bg-sunken px-3 py-2 type-meta text-foreground">Müşteri sorusu</span>
        <div className="flex items-center gap-2 px-2">
          <span className="h-px flex-1 bg-divider" />
          <span className="type-meta text-muted-foreground">kayıtlı cevap yok</span>
          <span className="h-px flex-1 bg-divider" />
        </div>
        <span className="block rounded-control border border-boundary bg-recessed px-3 py-2 type-meta font-semibold text-foreground">
          Cevaplanamayan sorular
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3" aria-hidden="true">
      <span className="rounded-control bg-recessed px-3 py-3 text-center type-meta font-semibold text-foreground">Asistan</span>
      <span className="type-meta font-semibold text-primary">⇄</span>
      <span className="rounded-control border border-primary/25 bg-selected/50 px-3 py-3 text-center type-meta font-semibold text-primary">Siz</span>
    </div>
  );
}
