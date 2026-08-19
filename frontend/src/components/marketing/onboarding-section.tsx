import * as React from "react";

import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

export function OnboardingSection() {
  return (
    <section
      id="kurulum"
      className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-4 py-16 md:px-6 md:py-24 lg:px-8"
    >
      <MarketingSectionHeading
        eyebrow="Kurulum"
        title="İşletmenizi anlatın, önce siz deneyin."
        description="Teknik bir proje kurmazsınız. Bize nasıl çalıştığınızı anlatır, asistanı müşteriye açmadan önce test edersiniz."
      />

      <div className="mt-10 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-10">
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
    ["İşletmenizi anlatın", "Ürünleriniz, teslimatınız ve kurallarınızla ilgili temel bilgileri ekleyin."],
    ["Önce siz deneyin", "Müşteriden önce test sohbetinde nasıl cevap verdiğini görün."],
    ["Hazır olduğunuzda açın", "Son kontrolünüzden sonra WhatsApp’a bağlayıp kullanmaya başlayın."],
  ] as const;

  return (
    <ol className="relative border-l border-divider pl-6">
      {steps.map(([title, body], index) => {
        const isTest = index === 1;
        return (
          <li key={title} className="relative pb-8 last:pb-0">
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
          <p className="mt-0.5 type-meta text-chrome-foreground/55">{MARKETING_STORY.storeLabel}</p>
        </div>
        <span className="rounded-control border border-boundary px-2.5 py-1 type-meta font-semibold text-muted-foreground">
          Müşteriye açık değil
        </span>
      </div>

      <div className="space-y-4 px-4 py-5 sm:px-6 sm:py-6">
        <ChatBubble from="customer">{MARKETING_STORY.customerQuestion}</ChatBubble>
        <ChatBubble from="assistant">{MARKETING_STORY.assistantAnswer}</ChatBubble>
        <div className="border-t border-divider pt-4">
          <p className="type-row-primary text-foreground">Hazır olduğuna siz karar verirsiniz.</p>
          <p className="mt-1 type-body text-muted">
            Canlıya çıkmadan önce konuşma biçimini kendi gözünüzle görürsünüz.
          </p>
        </div>
      </div>
    </div>
  );
}
