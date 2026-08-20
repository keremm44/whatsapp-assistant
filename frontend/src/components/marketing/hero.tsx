import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { Atmosphere, WindowLights } from "@/components/marketing/marketing-frame";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";

/**
 * First-screen proof stays intentionally simple: one clear promise and one
 * readable conversation close-up. The work-ledger language starts only after
 * the hero so the seller understands the product before seeing operational
 * detail. Primary content stays server-visible and never waits for hydration.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-divider bg-canvas">
      <Atmosphere />
      <div className="relative mx-auto grid w-full max-w-[1180px] gap-x-12 gap-y-7 px-4 pb-16 pt-12 md:px-6 md:pb-20 md:pt-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)] lg:grid-rows-[auto_auto] lg:items-center lg:px-8 lg:pb-24">
        <div className="flex flex-col items-start lg:col-start-1 lg:row-start-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="type-eyebrow text-muted-foreground">WhatsApp asistanı</p>
            <span aria-hidden="true" className="hidden h-px w-10 bg-divider sm:block" />
            <p className="type-meta text-muted-foreground">Kontrollü otomasyon · karar sizde</p>
          </div>

          <h1 className="mt-5 max-w-[720px] font-display text-[44px] font-semibold leading-[48px] tracking-[-0.03em] text-foreground sm:text-[56px] sm:leading-[60px] lg:text-[62px] lg:leading-[66px]">
            Tekrar eden WhatsApp konuşmalarını sizden önce karşılar.
          </h1>
          <p className="mt-6 max-w-[620px] text-lg leading-8 text-foreground">
            İşletmenizin bilgileriyle cevap verir. Bilmediğinde uydurmaz; karar
            gerçekten size ait olduğunda konuşmayı size bırakır.
          </p>
        </div>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <HeroConversation />
        </div>

        <div className="flex flex-col items-start gap-3 lg:col-start-1 lg:row-start-2">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#dene"
              className="inline-flex min-h-11 items-center rounded-control bg-primary-button px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Konuşmasını deneyin
            </a>
            <a
              href="#panel"
              className="inline-flex min-h-11 items-center px-2 py-3 text-base font-medium text-foreground underline decoration-divider underline-offset-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
    <div className="overflow-hidden rounded-sheet border border-boundary bg-sunken shadow-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider bg-chrome px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <WindowLights />
          <div>
          <p className="type-meta font-semibold text-chrome-foreground">
            {MARKETING_STORY.storeLabel}
          </p>
          <p className="mt-0.5 type-meta text-chrome-foreground/60">
            Örnek müşteri konuşması
          </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 type-meta font-semibold text-chrome-foreground/70">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
          />
          Asistan aktif
        </span>
      </div>

      <div className="space-y-3 px-4 py-5 sm:px-6 sm:py-6">
        <ChatBubble from="customer">{MARKETING_STORY.customerQuestion}</ChatBubble>
        <ChatBubble from="assistant">{MARKETING_STORY.assistantAnswer}</ChatBubble>
        <div className="border-t border-divider pt-4">
          <ChatBubble from="customer">{MARKETING_STORY.unknownQuestion}</ChatBubble>
          <div className="mt-3">
            <ChatBubble from="assistant">{MARKETING_STORY.unknownAnswer}</ChatBubble>
          </div>
        </div>
      </div>

      <div className="border-t border-divider bg-recessed px-4 py-3.5 sm:px-6">
        <p className="type-row-secondary text-muted">
          Kayıtlı bilgi yoksa cevap uydurmak yerine satıcıya bırakır.
        </p>
      </div>
    </div>
  );
}
