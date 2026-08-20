import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { WindowLights } from "@/components/marketing/marketing-frame";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";

export function OnboardingSection() {
  return (
    <section
      id="kurulum"
      className="mx-auto w-full max-w-[920px] scroll-mt-20 px-4 py-20 md:px-6 md:py-28"
    >
      <div className="max-w-[760px]">
        <p className="type-eyebrow text-muted-foreground">Canlıya çıkmadan önce</p>
        <h2 className="mt-3 font-display text-[34px] font-semibold leading-[40px] tracking-[-0.025em] text-foreground sm:text-[46px] sm:leading-[52px]">
          Müşteri görmeden önce siz görürsünüz.
        </h2>
        <p className="mt-4 max-w-2xl type-body text-muted">
          İşletmenizi anlatır, test sohbetinde nasıl cevap verdiğini kontrol eder ve
          ancak hazır olduğunuzda WhatsApp’a bağlarsınız.
        </p>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start">
        <SetupRail />
        <MarketingReveal variant="product">
          <TestConversation />
        </MarketingReveal>
      </div>
    </section>
  );
}

function SetupRail() {
  const steps = [
    ["İşletmenizi anlatın", "Ürün, teslimat ve kurallarınızla ilgili temel bilgileri ekleyin."],
    ["Önce siz deneyin", "Test sohbetinde cevabı kendi gözünüzle görün."],
    ["Hazır olduğunuzda açın", "Son kontrolünüzden sonra WhatsApp’a bağlayın."],
  ] as const;

  return (
    <ol className="relative border-l border-divider pl-6">
      {steps.map(([title, body], index) => {
        const isTest = index === 1;
        return (
          <li key={title} className="relative pb-8 last:pb-0">
            <span
              aria-hidden="true"
              className={
                isTest
                  ? "absolute -left-[29px] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-primary bg-selected"
                  : "absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full border border-boundary bg-recessed"
              }
            >
              {isTest ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
            </span>
            <p
              className={
                isTest
                  ? "type-meta font-semibold text-primary"
                  : "type-meta font-semibold text-muted-foreground"
              }
            >
              0{index + 1}
            </p>
            <h3 className="mt-1 type-row-primary text-foreground">{title}</h3>
            <p className="mt-1 type-row-secondary text-muted">{body}</p>
          </li>
        );
      })}
    </ol>
  );
}

function TestConversation() {
  return (
    <div className="overflow-hidden rounded-sheet border border-boundary bg-sunken shadow-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider bg-chrome px-4 py-3.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <WindowLights />
          <div>
          <p className="type-meta font-semibold text-chrome-foreground">Test sohbeti</p>
          <p className="mt-0.5 type-meta text-chrome-foreground/60">
            {MARKETING_STORY.storeLabel}
          </p>
          </div>
        </div>
        <span className="rounded-control border border-boundary px-2.5 py-1 type-meta font-semibold text-muted-foreground">
          Müşteriye açık değil
        </span>
      </div>

      <div className="px-4 py-6 sm:px-7 sm:py-7">
        <div className="space-y-4">
          <ChatBubble from="customer">{MARKETING_STORY.customerQuestion}</ChatBubble>
          <ChatBubble from="assistant">{MARKETING_STORY.assistantAnswer}</ChatBubble>
        </div>

        <div className="mt-7 border-t border-divider pt-6">
          <p className="font-heading text-xl font-semibold text-foreground sm:text-2xl">
            Hazır olduğuna siz karar verirsiniz.
          </p>
          <p className="mt-2 max-w-2xl text-base leading-7 text-foreground">
            Cevap biçimini ve verdiğiniz bilgilerin konuşmaya nasıl yansıdığını
            canlıya çıkmadan önce kontrol edersiniz.
          </p>
        </div>
      </div>
    </div>
  );
}
