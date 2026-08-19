import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { OwnershipLedgerRow } from "@/components/marketing/story-thread";

/**
 * Public first impression: the product behaviour itself is the composition.
 * There is no copy-left / mockup-right split. The seller sees one example
 * workday and can read who owns each conversation without opening a feature
 * card. All records are explicit examples, not production metrics.
 */
export function Hero() {
  const ledger = MARKETING_STORY.ledger;

  return (
    <section className="border-b border-divider bg-canvas">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-14 pt-12 md:px-6 md:pb-20 md:pt-20 lg:px-8 lg:pb-24">
        <div className="max-w-[900px]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="type-eyebrow text-muted-foreground">WhatsApp asistanı</p>
            <span aria-hidden="true" className="hidden h-px w-10 bg-divider sm:block" />
            <p className="type-meta text-muted-foreground">Kontrollü otomasyon · karar sizde</p>
          </div>

          <h1 className="mt-5 max-w-[880px] font-display text-[44px] font-semibold leading-[48px] tracking-[-0.03em] text-foreground sm:text-[58px] sm:leading-[62px] lg:text-[68px] lg:leading-[72px]">
            Her mesaj dikkatinizi istememeli.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-foreground">
            Tekrar eden konuşmaları işletmenizin bilgileriyle yürütür. Bilmediğinde
            uydurmaz; karar gerçekten size ait olduğunda konuşmayı önünüze bırakır.
          </p>
        </div>

        <div id="nasil-calisir" className="scroll-mt-20 pt-12 sm:pt-14">
          <div className="flex flex-col gap-3 border-b border-divider pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
            <div>
              <p className="type-meta font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Örnek iş günü
              </p>
              <p className="mt-1 font-heading text-xl font-semibold text-foreground sm:text-2xl">
                {MARKETING_STORY.storeLabel}
              </p>
            </div>
            <p className="max-w-md type-row-secondary text-muted sm:text-right">
              Aynı WhatsApp akışında rutin konuşma ilerler; belirsiz veya karar
              gerektiren konu ayrı bir sahiplik durumuna geçer.
            </p>
          </div>

          <div aria-label="Örnek WhatsApp iş günü kayıtları">
            <OwnershipLedgerRow
              time={ledger.known.time}
              topic={ledger.known.topic}
              message={ledger.known.message}
              owner={ledger.known.owner}
              outcome={MARKETING_STORY.assistantAnswer}
            />
            <OwnershipLedgerRow
              time={ledger.unknown.time}
              topic={ledger.unknown.topic}
              message={ledger.unknown.message}
              owner={ledger.unknown.owner}
              outcome={ledger.unknown.outcome}
              tone="handoff"
            />
            <OwnershipLedgerRow
              time={ledger.routine.time}
              topic={ledger.routine.topic}
              message={ledger.routine.message}
              owner={ledger.routine.owner}
              outcome={ledger.routine.outcome}
            />
            <OwnershipLedgerRow
              time={ledger.returnReview.time}
              topic={ledger.returnReview.topic}
              message={ledger.returnReview.message}
              owner={ledger.returnReview.owner}
              outcome={ledger.returnReview.outcome}
              tone="attention"
            />
          </div>

          <div className="grid border-y border-divider md:grid-cols-2 md:divide-x md:divide-divider">
            <div className="py-5 md:pr-8">
              <p className="type-meta font-semibold text-muted-foreground">Rutin konuşmalar</p>
              <p className="mt-1 font-heading text-xl font-semibold text-foreground">
                Akışta kalır.
              </p>
              <p className="mt-1.5 type-body text-muted">
                Ürün, kargo ve benzeri kayıtlı bilgiler için sizden yeni bir karar beklenmez.
              </p>
            </div>
            <div className="border-t border-divider py-5 md:border-t-0 md:pl-8">
              <p className="type-meta font-semibold text-muted-foreground">Karar gerekenler</p>
              <p className="mt-1 font-heading text-xl font-semibold text-foreground">
                Size ayrılır.
              </p>
              <p className="mt-1.5 type-body text-muted">
                Asistanın yetkisinin bittiği yer görünür olur; konu kaybolmadan size gelir.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-start gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#dene"
              className="inline-flex min-h-11 items-center rounded-control bg-primary-button px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Konuşmasını deneyin
            </a>
            <a
              href="#panel"
              className="inline-flex min-h-11 items-center rounded-control px-2 py-3 text-base font-medium text-foreground underline decoration-divider underline-offset-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Panelde nasıl göründüğüne bakın
            </a>
          </div>
          <p className="type-meta text-muted-foreground">
            Satıcı hesapları davet ile oluşturulur.
          </p>
        </div>
      </div>
    </section>
  );
}
