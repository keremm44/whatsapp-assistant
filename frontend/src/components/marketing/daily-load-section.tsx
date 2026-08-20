import * as React from "react";

import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { cn } from "@/lib/utils/cn";

type WorkdayTone = "routine" | "attention";

export function DailyLoadSection() {
  const ledger = MARKETING_STORY.ledger;

  return (
    <section id="nasil-calisir" className="scroll-mt-20 bg-canvas">
      <div className="mx-auto w-full max-w-[860px] px-4 py-20 md:px-6 md:py-28">
        <MarketingReveal>
          <p className="type-eyebrow text-muted-foreground">Günlük yük</p>
          <h2 className="mt-3 max-w-3xl font-display text-[34px] font-semibold leading-[40px] tracking-[-0.025em] text-foreground sm:text-[46px] sm:leading-[52px]">
            Gününüzü tekrar eden sorular değil, kararlar bölsün.
          </h2>
          <p className="mt-4 max-w-2xl type-body text-muted">
            Kayıtlı bilgiyle ilerleyebilen konuşmalar sessizce akar. Gerçekten sizin
            kararınızı isteyen konu ise aynı akışta görünür biçimde ayrılır.
          </p>
        </MarketingReveal>

        <MarketingReveal className="mt-10" variant="state">
          <div
            className="border-y border-divider"
            aria-label="Örnek bir iş günündeki konuşma sonuçları"
          >
            <WorkdayFragment
              time={ledger.known.time}
              topic={ledger.known.topic}
              message={ledger.known.message}
              result="Kayıtlı bilgiyle cevaplandı"
            />
            <WorkdayFragment
              time={ledger.routine.time}
              topic={ledger.routine.topic}
              message={ledger.routine.message}
              result="Asistan ilerletti"
            />
            <WorkdayFragment
              time={ledger.returnReview.time}
              topic={ledger.returnReview.topic}
              message={ledger.returnReview.message}
              result="Karar gerekiyor"
              tone="attention"
              last
            />
          </div>
        </MarketingReveal>

        <p className="mt-5 max-w-2xl type-row-secondary text-muted-foreground">
          Bunlar örnek kayıtlar; gerçek kullanım miktarı veya tasarruf metriği değildir.
        </p>
      </div>
    </section>
  );
}

function WorkdayFragment({
  time,
  topic,
  message,
  result,
  tone = "routine",
  last = false,
}: {
  time: string;
  topic: string;
  message: string;
  result: string;
  tone?: WorkdayTone;
  last?: boolean;
}) {
  const attention = tone === "attention";

  return (
    <article
      className={cn(
        "grid gap-3 py-5 sm:grid-cols-[76px_minmax(0,1fr)_170px] sm:items-center sm:gap-6",
        !last && "border-b border-divider",
      )}
    >
      <div className="flex items-baseline gap-3 sm:block">
        <time className="type-meta type-figure font-semibold text-muted-foreground">
          {time}
        </time>
        <p className="type-meta text-muted-foreground sm:mt-1">{topic}</p>
      </div>
      <p className="type-row-primary text-foreground">“{message}”</p>
      <div className="flex items-center gap-2 sm:justify-end sm:text-right">
        <span
          aria-hidden="true"
          className={cn(
            "h-2 w-2 shrink-0 rounded-full border",
            attention
              ? "border-attention bg-attention"
              : "border-boundary bg-muted-foreground",
          )}
        />
        <p
          className={cn(
            "type-meta font-semibold",
            attention ? "text-attention" : "text-muted-foreground",
          )}
        >
          {result}
        </p>
      </div>
    </article>
  );
}
