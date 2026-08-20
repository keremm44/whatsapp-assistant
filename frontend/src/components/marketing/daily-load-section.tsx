import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { cn } from "@/lib/utils/cn";

type WorkdayTone = "routine" | "attention";

export function DailyLoadSection() {
  const ledger = MARKETING_STORY.ledger;

  return (
    <section id="nasil-calisir" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-[720px] px-5 py-8 md:py-10">
        <MarketingReveal>
          <h2 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.022em] text-foreground">
            Gününüzü tekrar eden sorular değil, kararlar bölsün.
          </h2>
        </MarketingReveal>

        <MarketingReveal className="mt-8" variant="state">
          <div
            role="list"
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
      role="listitem"
      className={cn(
        "grid gap-2 py-4 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-4",
        !last && "border-b border-divider",
      )}
    >
      <time className="type-meta type-figure font-semibold text-muted-foreground">
        {time}
      </time>
      <div>
        <p className="type-row-primary text-foreground">“{message}”</p>
        <p className="mt-0.5 type-meta text-muted-foreground">{topic}</p>
      </div>
      <p
        className={cn(
          "type-meta font-semibold sm:text-right",
          attention ? "text-attention" : "text-muted-foreground",
        )}
      >
        {result}
      </p>
    </article>
  );
}
