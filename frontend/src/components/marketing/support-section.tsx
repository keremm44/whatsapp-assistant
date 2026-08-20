import { MarketingReveal } from "@/components/marketing/marketing-motion";

export function SupportSection() {
  return (
    <section className="bg-sunken">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-20 md:px-6 md:py-28 lg:px-8">
        <div className="mx-auto max-w-[850px]">
          <p className="type-eyebrow text-muted-foreground">Destek</p>
          <h2 className="mt-3 max-w-2xl font-display text-[30px] font-semibold leading-[36px] tracking-[-0.022em] text-foreground sm:text-[38px] sm:leading-[44px]">
            Kurulumdan sonra da aynı ürünün içindesiniz.
          </h2>
          <p className="mt-4 max-w-2xl type-body text-muted">
            Geri bildiriminizi panelden iletir, önemli gelişmeleri yine aynı çalışma
            yüzeyinde görürsünüz.
          </p>

          <MarketingReveal className="mt-8">
            <SupportBridge />
          </MarketingReveal>
        </div>

        <FinalProof />
      </div>
    </section>
  );
}

function SupportBridge() {
  const items = [
    {
      index: "01",
      title: "Panelden yazın",
      body: "Öneri, sorun veya şikayetinizi aynı ürün yüzeyinden iletin.",
    },
    {
      index: "02",
      title: "Gelişmeleri görün",
      body: "Önemli sistem bilgilendirmeleri ve duyurular panelinizde görünür.",
    },
  ] as const;

  return (
    <div>
      {items.map((item) => (
        <div
          key={item.index}
          className="grid gap-2 py-4 sm:grid-cols-[48px_minmax(0,1fr)] sm:gap-4"
        >
          <span className="type-meta font-semibold text-muted-foreground">{item.index}</span>
          <div>
            <h3 className="type-row-primary text-foreground">{item.title}</h3>
            <p className="mt-1.5 max-w-xl type-body text-muted">{item.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function FinalProof() {
  return (
    <div className="mt-20 pt-4 sm:mt-24">
      <p className="type-eyebrow text-muted-foreground">Sonuç</p>
      <h3 className="mt-4 max-w-[900px] font-display text-[40px] font-semibold leading-[46px] tracking-[-0.028em] text-foreground sm:text-[56px] sm:leading-[62px]">
        Rutin konuşmalar asistanda. Karar gerekenler sizde.
      </h3>
      <p className="mt-5 max-w-xl text-base leading-7 text-muted">
        WhatsApp işinizi böyle bölüştürün; önce nasıl konuştuğunu ve ne zaman sizi
        devreye aldığını kendiniz görün.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <a
          href="#dene"
          className="inline-flex min-h-11 items-center rounded-control bg-primary-button px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sunken"
        >
          Konuşmasını deneyin
        </a>
        <a
          href="#panel"
          className="inline-flex min-h-11 items-center px-1 py-3 text-base font-medium text-foreground underline decoration-divider underline-offset-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Bugün bakmanız gerekenleri görün
        </a>
      </div>
    </div>
  );
}
