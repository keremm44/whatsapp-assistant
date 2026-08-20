import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { SystemNote } from "@/components/marketing/system-note";
import { StatusChip } from "@/components/shared/status-chip";

export function CriticalStatesSection() {
  const returnRecord = MARKETING_STORY.ledger.returnReview;

  return (
    <section className="bg-canvas">
      <div className="mx-auto w-full max-w-[820px] px-4 py-12 md:px-6 md:py-16">
        <MarketingReveal>
          <p className="type-eyebrow text-muted-foreground">Sınır</p>
          <h2 className="mt-3 max-w-3xl font-display text-[28px] font-semibold leading-[34px] tracking-[-0.022em] text-foreground sm:text-[34px] sm:leading-[40px]">
            Bilmediğinde uydurmaz. Karar gerektiğinde durur.
          </h2>
        </MarketingReveal>

        <div className="mt-8 space-y-8">
          <MarketingReveal variant="state">
            <article className="grid gap-3 sm:grid-cols-[72px_minmax(0,1fr)] sm:gap-6">
              <time className="type-meta type-figure font-semibold text-muted-foreground">
                {MARKETING_STORY.ledger.unknown.time}
              </time>
              <div>
                <p className="type-row-primary text-foreground">
                  {MARKETING_STORY.unknownQuestion}
                </p>
                <p className="mt-2 type-body text-muted">{MARKETING_STORY.unknownAnswer}</p>
              </div>
            </article>
          </MarketingReveal>

          <MarketingReveal variant="state">
            <article className="grid gap-3 sm:grid-cols-[72px_minmax(0,1fr)] sm:gap-6">
              <time className="type-meta type-figure font-semibold text-muted-foreground">
                {returnRecord.time}
              </time>
              <div className="space-y-3">
                <p className="type-row-primary text-foreground">
                  {MARKETING_STORY.returnQuestion}
                </p>
                <SystemNote tone="attention" label="Otomatik yanıt durur">
                  {MARKETING_STORY.returnSystemOutcome}
                </SystemNote>
                <StatusChip tone="attention">İade incelemesi</StatusChip>
              </div>
            </article>
          </MarketingReveal>
        </div>
      </div>
    </section>
  );
}
