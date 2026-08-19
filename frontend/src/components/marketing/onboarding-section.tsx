import * as React from "react";

import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * Onboarding — the real emotional endpoint is not a numbered wizard, but
 * seeing the assistant speak before customers do. The setup beats stay
 * visible as a quiet rail while the test conversation carries the proof.
 */
export function OnboardingSection() {
  return (
    <section
      id="kurulum"
      className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-4 py-16 md:px-6 md:py-24 lg:px-8"
    >
      <MarketingSectionHeading
        eyebrow="Kurulum"
        title="Müşteriler görmeden önce siz deneyin."
        description="İşletme, ürün, kargo ve kurallarınızı hazırladıktan sonra asistanı test sohbetinde siz görürsünüz. Canlıya geçmeden önce konuşma biçimini kontrol edersiniz."
      />

      <div className="mt-12 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-10">
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
    ["İşletme", "Mağaza ve iletişim bilgileri"],
    ["Ürün / kargo", "Ürün özellikleri ve teslimat bilgileri"],
    ["Kurallar", "İade politikası ve kayıtlı cevaplar"],
    ["Test", "Müşteri görmeden önce test sohbeti"],
    ["WhatsApp", "Bağlantı, canlı test ve aktivasyon"],
  ] as const;

  return (
    <ol className="border-l border-divider pl-5">
      {steps.map(([title, body], index) => {
        const isTest = title === "Test";
        return (
          <li key={title} className="relative pb-6 last:pb-0">
            <span
              aria-hidden="true"
              className={
                isTest
                  ? "absolute -left-[23px] top-1 h-2.5 w-2.5 rounded-full bg-primary"
                  : "absolute -left-[22px] top-1.5 h-2 w-2 rounded-full bg-boundary"
              }
            />
            <p
              className={
                isTest
                  ? "type-meta font-semibold text-primary"
                  : "type-meta font-semibold text-muted-foreground"
              }
            >
              0{index + 1} · {title}
            </p>
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider bg-chrome/50 px-4 py-3 sm:px-5">
        <div>
          <p className="type-meta font-semibold text-chrome-foreground">Test sohbeti</p>
          <p className="mt-0.5 type-meta text-chrome-foreground/55">
            {MARKETING_STORY.storeLabel}
          </p>
        </div>
        <span className="rounded-control border border-boundary px-2.5 py-1 type-meta font-semibold text-muted-foreground">
          Müşteriye açık değil
        </span>
      </div>

      <div className="space-y-4 px-4 py-5 sm:px-6 sm:py-6">
        <ChatBubble from="customer">{MARKETING_STORY.customerQuestion}</ChatBubble>
        <ChatBubble from="assistant">{MARKETING_STORY.assistantAnswer}</ChatBubble>
        <ChatBubble from="customer">{MARKETING_STORY.unknownQuestion}</ChatBubble>
        <ChatBubble from="assistant">{MARKETING_STORY.unknownAnswer}</ChatBubble>

        <div className="border-t border-divider pt-4">
          <p className="type-meta font-semibold text-primary">Canlıya çıkmadan gördüğünüz şey</p>
          <p className="mt-1 type-body text-foreground">
            Normal cevap kadar, bilmediği yerde nasıl durduğu da test edilir.
          </p>
        </div>
      </div>
    </div>
  );
}
