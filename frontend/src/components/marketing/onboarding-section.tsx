import * as React from "react";

import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * Onboarding — framed as a calm seller journey rather than a technical
 * setup checklist. The emotional endpoint is still the real proof:
 * seeing the assistant speak before customers do.
 */
export function OnboardingSection() {
  return (
    <section
      id="kurulum"
      className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-4 py-16 md:px-6 md:py-24 lg:px-8"
    >
      <MarketingSectionHeading
        eyebrow="Kurulum"
        title="Önce işletmenizi anlatın. Sonra müşteriden önce siz deneyin."
        description="Teknik bir proje kurmazsınız. İşletmenizi, ürünlerinizi ve sınırlarınızı anlatırsınız; asistanı müşteriye açmadan önce test sohbetinde nasıl davrandığını görürsünüz."
      />

      <div className="mt-12 grid gap-8 lg:grid-cols-[330px_minmax(0,1fr)] lg:items-start lg:gap-10">
        <SetupRail />
        <MarketingReveal>
          <TestConversation />
        </MarketingReveal>
      </div>
    </section>
  );
}

function SetupRail() {
  const steps = [
    ["İşletmenizi tanıyalım", "Mağazanızı ve müşterilerinizin sizden neler beklediğini anlatın."],
    ["Ürünlerinizi anlatalım", "Müşterilerin en çok soracağı ürün ve teslimat bilgilerini ekleyin."],
    ["Sınırlarını siz belirleyin", "İade, teslimat ve nasıl cevap vermesini istediğinizi söyleyin."],
    ["Önce siz konuşun", "Müşteri görmeden önce asistanı test sohbetinde deneyin."],
    ["Hazır olduğunuzda açın", "Son kontrolünüzden sonra WhatsApp’a bağlayıp kullanmaya başlayın."],
  ] as const;

  return (
    <ol className="relative border-l border-divider pl-6">
      {steps.map(([title, body], index) => {
        const isTest = index === 3;
        return (
          <li key={title} className="relative pb-7 last:pb-0">
            <span
              aria-hidden="true"
              className={
                isTest
                  ? "absolute -left-[29px] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-primary/45 bg-selected"
                  : "absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full border border-boundary bg-recessed"
              }
            >
              {isTest ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
            </span>
            <p className={isTest ? "type-meta font-semibold text-primary" : "type-meta font-semibold text-muted-foreground"}>
              0{index + 1}
            </p>
            <h3 className="mt-1 type-row-primary text-foreground">{title}</h3>
            <p className="mt-1 type-row-secondary text-muted">{body}</p>
          </li>
        );
      })}
    </ol>
  );
}

function TestConversation() {
  return (
    <div className="overflow-hidden rounded-sheet border border-boundary/70 bg-sunken shadow-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider bg-chrome/50 px-4 py-3.5 sm:px-5">
        <div>
          <p className="type-meta font-semibold text-chrome-foreground">Önce siz deneyin</p>
          <p className="mt-0.5 type-meta text-chrome-foreground/55">{MARKETING_STORY.storeLabel} · test sohbeti</p>
        </div>
        <span className="rounded-control border border-boundary px-2.5 py-1 type-meta font-semibold text-muted-foreground">
          Müşteriye açık değil
        </span>
      </div>

      <div className="grid gap-5 px-4 py-5 sm:px-6 sm:py-6 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-4">
          <ChatBubble from="customer">{MARKETING_STORY.customerQuestion}</ChatBubble>
          <ChatBubble from="assistant">{MARKETING_STORY.assistantAnswer}</ChatBubble>
          <ChatBubble from="customer">{MARKETING_STORY.unknownQuestion}</ChatBubble>
          <ChatBubble from="assistant">{MARKETING_STORY.unknownAnswer}</ChatBubble>
        </div>

        <aside className="border-t border-divider pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
          <p className="type-meta font-semibold text-primary">Canlıdan önce gördüğünüz</p>
          <div className="mt-4 space-y-4">
            <ProofPoint title="Doğru bildiğini cevaplar" body="Kayıtlı ürün bilgisi konuşmaya yansır." />
            <ProofPoint title="Bilmediğinde durur" body="Uydurmak yerine sınırını açıkça gösterir." />
            <ProofPoint title="Siz karar verirsiniz" body="Hazır hissetmeden müşteriye açmak zorunda değilsiniz." />
          </div>
        </aside>
      </div>
    </div>
  );
}

function ProofPoint({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-l-2 border-boundary pl-3">
      <p className="type-meta font-semibold text-foreground">{title}</p>
      <p className="mt-1 type-meta text-muted-foreground">{body}</p>
    </div>
  );
}
