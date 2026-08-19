import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { BlurHeadline, MarketingReveal } from "@/components/marketing/marketing-motion";

/**
 * Hero — first screen: one clear promise, then the product proving it.
 * The transcript is intentionally present at every breakpoint so the
 * public surface never hides the product's face on mobile.
 */
export function Hero() {
  return (
    <section className="border-b border-divider bg-canvas">
      <div className="mx-auto grid w-full max-w-[1180px] gap-10 px-4 pb-14 pt-14 md:px-6 md:pb-18 md:pt-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(480px,1.1fr)] lg:items-center lg:gap-12 lg:px-8 lg:pb-24">
        <div className="flex flex-col items-start gap-6">
          <p className="type-eyebrow text-muted-foreground">WhatsApp asistanı</p>
          <BlurHeadline
            text="Tekrar eden konuşmaları sizden önce karşılar."
            className="max-w-3xl font-display text-[42px] font-semibold leading-[46px] tracking-[-0.026em] text-foreground sm:text-[56px] sm:leading-[60px] lg:text-[64px] lg:leading-[68px]"
          />
          <p className="max-w-xl text-lg leading-8 text-foreground/88">
            İşletmenizin bilgileriyle konuşur. Bilmediğinde uydurmaz; karar
            gerektiğinde size bırakır.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#dene"
              className="rounded-control bg-primary-button px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Konuşmasını görün
            </a>
            <a
              href="#panel"
              className="rounded-control border border-boundary px-5 py-3 text-base font-medium text-foreground transition-colors hover:border-primary/45 hover:bg-hover/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Satıcı panelini görün
            </a>
          </div>
          <p className="type-meta text-muted-foreground">
            Satıcı hesapları davet ile oluşturulur.
          </p>
        </div>

        <MarketingReveal>
          <HeroConversation />
        </MarketingReveal>
      </div>
    </section>
  );
}

function HeroConversation() {
  return (
    <div className="overflow-hidden rounded-sheet border border-boundary/70 bg-sunken shadow-surface">
      <div className="flex items-center justify-between gap-3 border-b border-divider bg-chrome/55 px-4 py-3 sm:px-5">
        <div>
          <p className="type-meta font-semibold text-chrome-foreground">
            {MARKETING_STORY.storeLabel}
          </p>
          <p className="mt-0.5 type-meta text-chrome-foreground/55">
            Örnek konuşma · ürün bilgisi + sınır davranışı
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 type-meta font-semibold text-primary">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
          Asistan aktif
        </span>
      </div>

      <div className="space-y-4 px-4 py-5 sm:px-6 sm:py-6">
        <ChatBubble from="customer">{MARKETING_STORY.customerQuestion}</ChatBubble>
        <ChatBubble from="assistant">{MARKETING_STORY.assistantAnswer}</ChatBubble>
        <ChatBubble from="customer">{MARKETING_STORY.unknownQuestion}</ChatBubble>
        <ChatBubble from="assistant">{MARKETING_STORY.unknownAnswer}</ChatBubble>

        <div className="mt-1 border-t border-divider pt-4">
          <p className="type-meta font-semibold text-muted-foreground">Sistemin yaptığı</p>
          <p className="mt-1 type-body text-foreground">
            Cevap kayıtlı değilse soru satıcının cevaplanamayan sorular listesine düşer.
          </p>
        </div>
      </div>
    </div>
  );
}
