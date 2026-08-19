import * as React from "react";

import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * Kurulum — answers "işletmemi öğretmek zor mu?" with the real
 * onboarding concepts the backend supports (10 steps), grouped into four
 * human beats so it reads as a short, understandable progression rather
 * than a long form. One contiguous ledger, not a grid of cards; it
 * makes no claim about a finished wizard UI.
 */
export function OnboardingSection() {
  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-20 lg:px-8">
      <MarketingSectionHeading
        eyebrow="Kurulum"
        title="Kurulum, işletmenizi tanıtmaktan ibaret."
        description="Asistanı siz bilgilerinizle hazırlarsınız; o da bu bilgilerle konuşur. Her adımın neden istendiği açıktır, gereksiz teknik detay yoktur."
      />

      <ol className="mt-10 divide-y divide-divider overflow-hidden rounded-sheet border border-boundary/60 bg-raised shadow-surface">
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
        />
      </ol>

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
}: {
  index: number;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <span
        aria-hidden="true"
        className="type-figure mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-recessed font-display text-[13px] font-semibold text-muted-foreground"
      >
        {index}
      </span>
      <div className="space-y-1">
        <h3 className="type-row-primary text-foreground">{title}</h3>
        <p className="type-row-secondary text-muted">{body}</p>
      </div>
    </li>
  );
}
