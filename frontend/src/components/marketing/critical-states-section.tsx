import * as React from "react";

import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { SystemNote } from "@/components/marketing/system-note";
import { StatusChip } from "@/components/shared/status-chip";

export function CriticalStatesSection() {
  const returnRecord = MARKETING_STORY.ledger.returnReview;

  return (
    <section className="bg-canvas">
      <div className="mx-auto w-full max-w-[820px] px-4 py-20 md:px-6 md:py-28">
        <MarketingReveal>
          <p className="type-eyebrow text-muted-foreground">Sınır</p>
          <h2 className="mt-3 max-w-3xl font-display text-[34px] font-semibold leading-[40px] tracking-[-0.025em] text-foreground sm:text-[46px] sm:leading-[52px]">
            Bilmediğinde uydurmaz. Karar gerektiğinde durur.
          </h2>
          <p className="mt-4 max-w-2xl type-body text-muted">
            Güven, her mesaja cevap vermesinden değil; nerede devam etmeyeceğini
            bilmesinden gelir.
          </p>
        </MarketingReveal>

        <div className="mt-12 space-y-14">
          <MarketingReveal variant="state">
            <article>
              <div className="flex items-baseline justify-between gap-4 border-b border-divider pb-4">
                <div>
                  <p className="type-meta font-semibold text-muted-foreground">Bilinmeyen soru</p>
                  <h3 className="mt-1 font-heading text-xl font-semibold text-foreground sm:text-2xl">
                    Net bilgi yoksa bunu açıkça söyler.
                  </h3>
                </div>
                <span className="type-meta text-muted-foreground">
                  {MARKETING_STORY.ledger.unknown.time}
                </span>
              </div>
              <div className="mt-6 space-y-3">
                <ChatBubble from="customer">{MARKETING_STORY.unknownQuestion}</ChatBubble>
                <ChatBubble from="assistant">{MARKETING_STORY.unknownAnswer}</ChatBubble>
              </div>
            </article>
          </MarketingReveal>

          <MarketingReveal variant="state">
            <article className="border-t border-divider pt-10">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="type-meta font-semibold text-attention">Karar satıcıda</p>
                  <h3 className="mt-1 font-heading text-xl font-semibold text-foreground sm:text-2xl">
                    İade talebinde otomatik konuşma devam etmez.
                  </h3>
                </div>
                <span className="type-meta text-muted-foreground">{returnRecord.time}</span>
              </div>

              <div className="mt-6 space-y-3">
                <ChatBubble from="customer">{MARKETING_STORY.returnQuestion}</ChatBubble>
                <SystemNote tone="attention" label="Otomatik yanıt durur">
                  {MARKETING_STORY.returnSystemOutcome}
                </SystemNote>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-divider pt-5">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusChip tone="attention">İade incelemesi</StatusChip>
                  <span className="type-row-secondary text-muted-foreground">
                    Panelde İncelemeniz gerekiyor olarak görünür.
                  </span>
                </div>
                <p className="type-meta text-muted-foreground">
                  Aynı {returnRecord.time} kaydı aşağıdaki seller workspace’e geçer.
                </p>
              </div>
            </article>
          </MarketingReveal>
        </div>
      </div>
    </section>
  );
}
