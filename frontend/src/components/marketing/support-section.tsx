import * as React from "react";

import { MagneticLink, MarketingReveal } from "@/components/marketing/marketing-motion";

export function SupportSection() {
  return (
    <section className="border-t border-divider bg-sunken">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-22 lg:px-8">
        <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)] md:items-end md:gap-12">
          <p className="type-meta font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Aynı ürünün içinde · 06
          </p>
          <div>
            <h2 className="font-display text-[34px] font-semibold leading-[40px] tracking-[-0.025em] text-foreground sm:text-[46px] sm:leading-[52px]">
              Kurulumdan sonra da yalnız değilsiniz.
            </h2>
            <p className="mt-3 max-w-2xl type-body text-muted">
              Geri bildiriminizi panelden iletir, önemli gelişmeleri yine aynı çalışma yüzeyinde görürsünüz.
            </p>
          </div>
        </div>

        <MarketingReveal className="mt-9">
          <SupportBridge />
        </MarketingReveal>

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
    <div className="grid border-y border-divider md:grid-cols-2 md:divide-x md:divide-divider">
      {items.map((item) => (
        <div
          key={item.index}
          className="flex gap-4 border-b border-divider px-1 py-5 last:border-b-0 md:border-b-0 md:px-6 md:first:pl-0"
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
    <div className="mt-16 border-t border-divider pt-12 sm:mt-20 sm:pt-16">
      <p className="type-meta font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Ownership sonucu
      </p>

      <div className="mt-6 grid border-y border-divider md:grid-cols-2 md:divide-x md:divide-divider">
        <div className="py-7 md:pr-10">
          <p className="type-meta font-semibold text-muted-foreground">Rutin konuşmalar</p>
          <div className="mt-3 flex items-center gap-3">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
            <p className="font-display text-[34px] font-semibold leading-none tracking-[-0.025em] text-foreground sm:text-[42px]">
              Asistanda
            </p>
          </div>
          <p className="mt-3 max-w-md type-body text-muted">
            Kayıtlı bilgilerle ilerleyebilen konuşmalar sizin yeni bir kararınızı beklemez.
          </p>
        </div>

        <div className="border-t border-divider py-7 md:border-t-0 md:pl-10">
          <p className="type-meta font-semibold text-muted-foreground">Karar gerekenler</p>
          <div className="mt-3 flex items-center gap-3">
            <span aria-hidden="true" className="h-2 w-2 rounded-full border border-boundary bg-muted-foreground" />
            <p className="font-display text-[34px] font-semibold leading-none tracking-[-0.025em] text-foreground sm:text-[42px]">
              Sizde
            </p>
          </div>
          <p className="mt-3 max-w-md type-body text-muted">
            Yetki, belirsizlik veya karar gerektiğinde konuşmanın sahibi açıkça siz olursunuz.
          </p>
        </div>
      </div>

      <div className="mt-10 max-w-3xl">
        <h3 className="font-display text-[40px] font-semibold leading-[46px] tracking-[-0.028em] text-foreground sm:text-[54px] sm:leading-[60px]">
          WhatsApp işinizi böyle bölüştürün.
        </h3>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted">
          Önce nasıl konuştuğunu ve ne zaman sizi devreye aldığını kendiniz görün.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-4">
          <MagneticLink
            href="#dene"
            className="inline-flex min-h-11 items-center rounded-control bg-primary-button px-5 py-3 text-base font-medium text-primary-foreground hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sunken"
          >
            Konuşmasını deneyin
          </MagneticLink>
          <a
            href="#panel"
            className="inline-flex min-h-11 items-center px-1 py-3 text-base font-medium text-foreground underline decoration-divider underline-offset-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Satıcı panelini görün
          </a>
        </div>
      </div>
    </div>
  );
}
