import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { SystemNote } from "@/components/marketing/system-note";

/**
 * Hero — first screen: one clear promise, then the product proving it.
 *
 * The H1 and product proof intentionally render fully visible on the
 * server. Motion is progressive enhancement elsewhere on the page; the
 * primary promise and proof must never wait for hydration or JavaScript.
 * On mobile the conversation appears before the CTAs so the seller sees
 * the product before being asked to act; desktop keeps the two-column
 * Instrument composition.
 */
export function Hero() {
  return (
    <section className="border-b border-divider bg-canvas">
      <div className="mx-auto grid w-full max-w-[1180px] gap-x-12 gap-y-6 px-4 pb-14 pt-12 md:px-6 md:pb-20 md:pt-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(480px,1.1fr)] lg:grid-rows-[auto_auto] lg:items-center lg:gap-y-7 lg:px-8 lg:pb-24">
        <div className="flex flex-col items-start gap-5 lg:col-start-1 lg:row-start-1">
          <p className="type-eyebrow text-muted-foreground">WhatsApp asistanı</p>
          <h1 className="max-w-3xl font-display text-[42px] font-semibold leading-[46px] tracking-[-0.026em] text-foreground sm:text-[56px] sm:leading-[60px] lg:text-[64px] lg:leading-[68px]">
            Tekrar eden konuşmaları sizden önce karşılar.
          </h1>
          <p className="max-w-xl text-lg leading-8 text-foreground">
            İşletmenizin bilgileriyle konuşur. Bilmediğinde uydurmaz; karar
            gerektiğinde size bırakır.
          </p>
        </div>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <HeroConversation />
        </div>

        <div className="flex flex-col items-start gap-3 lg:col-start-1 lg:row-start-2">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#dene"
              className="rounded-control bg-primary-button px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Konuşmasını görün
            </a>
            <a
              href="#panel"
              className="rounded-control border border-boundary px-5 py-3 text-base font-medium text-foreground transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Satıcı panelini görün
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

function HeroConversation() {
  return (
    <div className="overflow-hidden rounded-sheet border border-boundary bg-sunken shadow-surface">
      <div className="flex items-center justify-between gap-3 border-b border-divider bg-chrome px-4 py-3 sm:px-5">
        <div>
          <p className="type-meta font-semibold text-chrome-foreground">
            {MARKETING_STORY.storeLabel}
          </p>
          <p className="mt-0.5 type-meta text-chrome-foreground/60">
            Örnek konuşma · ürün bilgisi + sınır davranışı
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 type-meta font-semibold text-chrome-foreground/70">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
          />
          Asistan aktif
        </span>
      </div>

      <div className="space-y-3 px-4 py-4 sm:space-y-4 sm:px-6 sm:py-6">
        <ChatBubble from="customer">{MARKETING_STORY.customerQuestion}</ChatBubble>
        <ChatBubble from="assistant">{MARKETING_STORY.assistantAnswer}</ChatBubble>
        <ChatBubble from="customer">{MARKETING_STORY.unknownQuestion}</ChatBubble>
        <ChatBubble from="assistant">{MARKETING_STORY.unknownAnswer}</ChatBubble>

        <SystemNote tone="neutral" label="Sistemin yaptığı">
          Cevap kayıtlı değilse soru satıcının cevaplanamayan sorular listesine düşer.
        </SystemNote>
      </div>
    </div>
  );
}
