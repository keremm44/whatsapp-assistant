import * as React from "react";

import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal, TrueFocusLine } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * Control — one conversation, three ownership states. The product UI
 * carries the proof; copy only explains what the seller is seeing.
 */
export function ControlSection() {
  return (
    <section
      id="kontrol"
      className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-4 py-16 md:px-6 md:py-20 lg:px-8"
    >
      <MarketingSectionHeading
        eyebrow="Kontrol"
        title="Konuşmayı istediğiniz anda devralırsınız."
        description="Asistan yalnızca verdiğiniz bilgilerle ilerler. Karar sizdeyse konuşmayı size bırakır; işiniz bittiğinde aynı yerden asistana geri verirsiniz."
      />

      <div className="mt-6 max-w-3xl border-l-2 border-primary/55 pl-4 sm:pl-5">
        <TrueFocusLine
          words={["Bilir.", "Cevaplar.", "Bilmezse", "durur.", "Size", "bırakır."]}
          className="font-heading text-xl font-semibold leading-8 text-foreground sm:text-2xl"
        />
      </div>

      <MarketingReveal className="mt-10">
        <ControlWorkbench />
      </MarketingReveal>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <ControlFact
          title="Bilgi sizden gelir"
          body="Ürün bilgileri, kurallar ve kayıtlı cevaplar karar kaynağıdır."
        />
        <ControlFact
          title="Bilinmeyen soru kaybolmaz"
          body="Cevabı yoksa uydurmak yerine soruyu satıcının listesine taşır."
        />
        <ControlFact
          title="Devralma görünürdür"
          body="Konuşmayla kimin ilgilendiği panelde açıkça görünür."
        />
      </div>
    </section>
  );
}

function ControlWorkbench() {
  return (
    <div className="overflow-hidden rounded-sheet border border-boundary/70 bg-raised shadow-surface">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="border-b border-divider bg-sunken px-4 py-5 sm:px-6 lg:border-b-0 lg:border-r lg:py-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="type-meta font-semibold text-foreground">
                {MARKETING_STORY.storeLabel}
              </p>
              <p className="mt-0.5 type-meta text-muted-foreground">
                Aynı konuşma · kontrol yüzeyi
              </p>
            </div>
            <span className="rounded-control bg-selected px-2.5 py-1 type-meta font-semibold text-primary">
              Asistan aktif
            </span>
          </div>

          <div className="space-y-3">
            <ChatBubble from="customer">{MARKETING_STORY.unknownQuestion}</ChatBubble>
            <ChatBubble from="assistant">{MARKETING_STORY.unknownAnswer}</ChatBubble>
          </div>
        </div>

        <div className="divide-y divide-divider">
          <OwnershipState
            label="01 · Asistan aktif"
            body="Kayıtlı bilgilerle müşteriye yanıt verir."
            action="Ben ilgileneceğim"
            active
          />
          <OwnershipState
            label="02 · Siz ilgileniyorsunuz"
            body="Asistan konuşmaya yeni yanıt göndermez."
            action="Asistana bırak"
          />
          <OwnershipState
            label="03 · Asistana geri verildi"
            body="Konuşma aynı bağlamla yeniden asistana döner."
          />
        </div>
      </div>
    </div>
  );
}

function OwnershipState({
  label,
  body,
  action,
  active = false,
}: {
  label: string;
  body: string;
  action?: string;
  active?: boolean;
}) {
  return (
    <div className={active ? "bg-selected/55 px-4 py-4" : "px-4 py-4"}>
      <p className={active ? "type-meta font-semibold text-primary" : "type-meta font-semibold text-muted-foreground"}>
        {label}
      </p>
      <p className="mt-1 type-row-secondary text-muted">{body}</p>
      {action ? (
        <span className="mt-3 inline-flex rounded-control border border-boundary px-3 py-1.5 text-sm font-medium text-foreground">
          {action}
        </span>
      ) : null}
    </div>
  );
}

function ControlFact({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-t border-divider pt-4">
      <h3 className="type-row-primary text-foreground">{title}</h3>
      <p className="mt-1 type-body text-muted">{body}</p>
    </div>
  );
}
