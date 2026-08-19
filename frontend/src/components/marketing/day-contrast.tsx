import * as React from "react";

import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * Value contrast — deliberately short and asymmetric. This section owns
 * one question only: "Günlük yüküm nasıl değişiyor?" Product behaviour
 * details live later in Demo / Control so they are not repeated here.
 */
export function DayContrast() {
  return (
    <section
      id="nasil-calisir"
      className="mx-auto w-full max-w-[1100px] scroll-mt-20 px-4 py-12 md:px-6 md:py-16 lg:px-8"
    >
      <MarketingSectionHeading
        eyebrow="Yük"
        title="Telefonun başında beklemek yerine yalnızca gereken yere bakın."
        description="Tekrar eden konuşmaları asistan üstlenir. Karar gerçekten size ait olduğunda konu önünüze gelir."
      />

      <div className="mt-8 grid gap-5 lg:grid-cols-[0.78fr_1.22fr] lg:items-stretch lg:gap-7">
        <MarketingReveal>
          <WithoutAssistant />
        </MarketingReveal>
        <MarketingReveal>
          <WithAssistant />
        </MarketingReveal>
      </div>
    </section>
  );
}

function WithoutAssistant() {
  return (
    <div className="h-full overflow-hidden rounded-sheet border border-boundary bg-recessed shadow-surface">
      <div className="border-b border-divider px-5 py-4">
        <p className="type-meta font-semibold text-muted-foreground">Asistansız</p>
        <p className="mt-1 font-heading text-lg font-semibold text-foreground">
          Her tekrar eden konuşma yeniden size gelir.
        </p>
      </div>
      <div className="space-y-3 px-5 py-5">
        <WorkLine text="Aynı ürün, kargo ve sipariş sorularını tekrar tekrar yanıtlarsınız." />
        <WorkLine text="Karar gereken konu ile rutin soru aynı dikkati ister." />
      </div>
    </div>
  );
}

function WithAssistant() {
  return (
    <div className="h-full overflow-hidden rounded-sheet border border-boundary bg-raised shadow-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-divider bg-chrome px-5 py-4 sm:px-6">
        <div>
          <p className="type-meta font-semibold text-primary">Asistanla</p>
          <p className="mt-1 font-heading text-xl font-semibold tracking-[-0.015em] text-foreground">
            Rutin konuşma akar; dikkatiniz gereken konu ayrılır.
          </p>
        </div>
        <span className="rounded-control border border-primary bg-selected px-2.5 py-1 type-meta font-semibold text-primary">
          Kontrol sizde
        </span>
      </div>

      <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2">
        <OutcomeArtefact
          eyebrow="Tekrar eden soru"
          title="Asistan karşılar"
          body="Kayıtlı işletme bilgisiyle rutin konuşma sizin müdahalenizi beklemez."
        />
        <OutcomeArtefact
          eyebrow="Karar gereken konu"
          title="Size ayrılır"
          body="Gerçekten sizin kararınızı isteyen konu görünür biçimde önünüze gelir."
          primary
        />
      </div>
    </div>
  );
}

function WorkLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-divider pb-3 last:border-b-0 last:pb-0">
      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
      <p className="type-body text-muted">{text}</p>
    </div>
  );
}

function OutcomeArtefact({
  eyebrow,
  title,
  body,
  primary = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  primary?: boolean;
}) {
  return (
    <div className="rounded-sheet border border-boundary bg-sunken px-4 py-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={primary ? "h-2 w-2 rounded-full bg-primary" : "h-2 w-2 rounded-full bg-muted-foreground"}
        />
        <p className={primary ? "type-meta font-semibold text-primary" : "type-meta font-semibold text-muted-foreground"}>
          {eyebrow}
        </p>
      </div>
      <p className="mt-3 font-heading text-lg font-semibold text-foreground">{title}</p>
      <p className="mt-1.5 type-row-secondary text-muted">{body}</p>
    </div>
  );
}
