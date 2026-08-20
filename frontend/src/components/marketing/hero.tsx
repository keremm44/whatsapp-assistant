import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";

/**
 * Opening of the public document. Server-visible: one promise, one
 * known exchange. No device chrome. Primary content never waits for hydration.
 */
export function Hero() {
  return (
    <section className="bg-canvas">
      <div className="mx-auto w-full max-w-[720px] px-5 pb-12 pt-16 md:pb-16 md:pt-24">
        <p className="type-eyebrow text-muted-foreground">WhatsApp asistanı</p>
        <h1 className="mt-5 font-display text-[40px] font-semibold leading-[46px] tracking-[-0.03em] text-foreground sm:text-[52px] sm:leading-[58px]">
          Tekrar eden WhatsApp konuşmalarını sizden önce karşılar.
        </h1>
        <p className="mt-6 text-[17px] leading-8 text-foreground">
          İşletmenizin kayıtlı bilgisiyle cevap verir. Bilmediğinde uydurmaz.
          Karar sizdeyse konuşmayı size bırakır.
        </p>

        <div className="mt-10">
          <HeroConversation />
        </div>

        <div className="mt-10 flex flex-col items-start gap-3">
          <a
            href="#dene"
            className="inline-flex min-h-11 items-center rounded-control bg-primary-button px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Konuşmasını deneyin
          </a>
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
    <div>
      <p className="type-meta text-muted-foreground">{MARKETING_STORY.storeLabel}</p>
      <div className="mt-3 border-y border-divider">
        <ChatBubble from="customer">{MARKETING_STORY.customerQuestion}</ChatBubble>
        <div className="border-t border-divider">
          <ChatBubble from="assistant">{MARKETING_STORY.assistantAnswer}</ChatBubble>
        </div>
      </div>
    </div>
  );
}
