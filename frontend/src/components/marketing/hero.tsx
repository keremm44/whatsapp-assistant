import { ChatBubble, ChatProofCard } from "@/components/marketing/chat-bubbles";
import { BlurHeadline, MarketingReveal } from "@/components/marketing/marketing-motion";

/**
 * Hero — the first screen does one job: "this could be for me."
 *
 * It is text-led and pain-first. The right-side proof card is a single
 * short exchange that shows the product's real answer/escalation
 * behaviour in one glance, labelled as an example so it can never be
 * read as a live chat. The one primary action is the scripted demo; the
 * existing-seller path lives in the header.
 */
export function Hero() {
  return (
    <section className="mx-auto grid w-full max-w-[1180px] gap-12 px-4 pb-16 pt-14 md:px-6 md:pt-20 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center lg:gap-10 lg:px-8 lg:pb-20">
      <div className="flex flex-col items-start gap-6">
        <p className="type-eyebrow text-muted-foreground">WhatsApp asistanı</p>
        <BlurHeadline
          text="WhatsApp'ta tekrar eden işleri asistanınız yönetsin."
          className="font-display text-[36px] font-semibold leading-[42px] tracking-[-0.022em] text-foreground sm:text-[48px] sm:leading-[54px]"
        />
        <p className="max-w-xl text-lg leading-8 text-muted">
          İşletmenizin bilgileriyle konuşur. Bilmediğinde uydurmaz; karar
          gerektiğinde size bırakır. Kontrol her zaman sizde.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="#dene"
            className="rounded-control bg-primary-button px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Konuşmasını görün
          </a>
        </div>
        <p className="type-meta text-muted-foreground">
          Satıcı hesapları davet ile oluşturulur.
        </p>
      </div>

      <MarketingReveal className="hidden lg:block">
        <ChatProofCard label="Örnek konuşma">
          <ChatBubble from="customer">Kupanız mikrodalgaya girer mi?</ChatBubble>
          <ChatBubble from="assistant">
            Evet, kupalarımız mikrodalgada kullanılabilir.
          </ChatBubble>
          <ChatBubble from="customer">Hediye kutusu da gönderiyor musunuz?</ChatBubble>
          <ChatBubble from="assistant">
            Bu konuda kayıtlı net bir bilgimiz bulunmuyor. Sorunuzu
            satıcımıza iletiyorum.
          </ChatBubble>
        </ChatProofCard>
      </MarketingReveal>
    </section>
  );
}
