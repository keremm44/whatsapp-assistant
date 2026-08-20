import { MarketingReveal } from "@/components/marketing/marketing-motion";

export function OnboardingSection() {
  return (
    <section
      id="kurulum"
      className="mx-auto w-full max-w-[720px] scroll-mt-20 px-5 py-12 md:py-16"
    >
      <h2 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.022em] text-foreground">
        Müşteri görmeden önce siz görürsünüz.
      </h2>
      <p className="mt-4 type-body text-muted">
        İşletmenizi anlatır, nasıl cevap verdiğini kontrol eder, hazır
        olduğunuzda WhatsApp’a bağlarsınız.
      </p>

      <MarketingReveal variant="product" className="mt-8">
        <SetupRail />
      </MarketingReveal>
    </section>
  );
}

function SetupRail() {
  const steps = [
    ["İşletmenizi anlatın", "Ürün, teslimat ve kurallarınızı ekleyin."],
    ["Önce siz deneyin", "Test sohbetinde cevabı kendi gözünüzle görün."],
    ["Hazır olduğunuzda açın", "Son kontrolünüzden sonra bağlayın."],
  ] as const;

  return (
    <ol>
      {steps.map(([title, body], index) => (
        <li key={title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 py-3">
          <span className="type-meta font-semibold text-muted-foreground">
            0{index + 1}
          </span>
          <div>
            <h3 className="type-row-primary text-foreground">{title}</h3>
            <p className="mt-1 type-row-secondary text-muted">{body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
