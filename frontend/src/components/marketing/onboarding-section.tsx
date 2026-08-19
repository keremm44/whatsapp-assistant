import * as React from "react";

import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * Kurulum — answers "işletmemi öğretmek zor mu?" with the real
 * onboarding concepts the backend supports (10 steps), grouped into four
 * human beats so it reads as a short, understandable progression rather
 * than a long form. It does not claim a finished wizard UI.
 */
export function OnboardingSection() {
  return (
    <section id="kurulum" className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-4 py-16 md:px-6 md:py-20 lg:px-8">
      <MarketingSectionHeading
        eyebrow="Kurulum"
        title="Kurulum, işletmenizi tanıtmaktan ibaret."
        description="Asistanı siz bilgilerinizle hazırlarsınız; o da bu bilgilerle konuşur. Her adımın neden istendiği açıktır, gereksiz teknik detay yoktur."
      />

      <MarketingReveal className="mt-10">
        <ol className="overflow-hidden rounded-sheet border border-boundary/60 bg-raised shadow-surface">
          <OnboardingStep
            index={1}
            title="İşletme ve mağaza"
            body="Ad, iletişim bilgileri ve ürünlerin satıldığı mağaza bağlantısı."
          />
          <OnboardingStep
            index={2}
            title="Ürün ve kargo"
            body="Materyal, ölçü, baskı yöntemi, hazırlık süresi ve kargo şirketi."
          />
          <OnboardingStep
            index={3}
            title="İade politikası ve kurallar"
            body="İade süresi, değişim kuralları ve sık sorulanlara hazır cevaplar."
          />
          <OnboardingStep
            index={4}
            title="Test edip canlıya çıkın"
            body="Test sohbeti, WhatsApp bağlantısı, canlı test ve ardından aktivasyon."
            last
          />
        </ol>
      </MarketingReveal>

      <p className="mt-6 max-w-2xl type-body text-muted">
        Canlıya çıkmadan önce asistanı bir test sohbetinde denersiniz. Müşteriler
        onu görmeden, siz nasıl konuştuğunu görürsünüz.
      </p>
    </section>
  );
}

function OnboardingStep({
  index,
  title,
  body,
  last = false,
}: {
  index: number;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <li className="group relative flex items-start gap-4 px-5 py-5 transition-colors duration-150 hover:bg-hover/25">
      <div className="relative flex shrink-0 flex-col items-center self-stretch">
        <span
          aria-hidden="true"
          className="type-figure relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-boundary bg-recessed font-display text-[13px] font-semibold text-muted-foreground transition-colors duration-150 group-hover:border-primary/60 group-hover:text-primary"
        >
          {index}
        </span>
        {!last ? (
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-8 h-[calc(100%+1.25rem)] w-px -translate-x-1/2 bg-divider"
          />
        ) : null}
      </div>
      <div className="min-w-0 space-y-1 pb-1">
        <h3 className="type-row-primary text-foreground">{title}</h3>
        <p className="type-row-secondary text-muted">{body}</p>
      </div>
    </li>
  );
}
