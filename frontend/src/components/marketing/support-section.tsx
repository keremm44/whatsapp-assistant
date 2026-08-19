import * as React from "react";

import { MagneticLink, MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

export function SupportSection() {
  return (
    <section className="border-t border-divider bg-sunken">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-20 md:px-6 md:py-28 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Yanınızdayız"
          title="Kurulumdan sonra da aynı ürünün içindesiniz."
          description="Geri bildiriminizi panelden iletir, önemli gelişmeleri yine panelinizde görürsünüz."
        />

        <MarketingReveal className="mt-9">
          <SupportBridge />
        </MarketingReveal>

        <MarketingReveal className="mt-10">
          <FinalProof />
        </MarketingReveal>
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
        <div key={item.index} className="flex gap-4 border-b border-divider px-1 py-5 last:border-b-0 md:border-b-0 md:px-6 md:first:pl-0">
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
    <div className="flex min-h-[360px] flex-col justify-between overflow-hidden rounded-sheet border border-boundary bg-chrome px-6 py-8 shadow-surface sm:px-9 sm:py-10">
      <div className="max-w-2xl">
        <p className="type-meta font-semibold text-muted-foreground">Son karar sizde</p>
        <h3 className="mt-4 font-display text-[38px] font-semibold leading-[44px] tracking-[-0.026em] text-chrome-foreground sm:text-[48px] sm:leading-[54px]">
          Önce görün. Sonra karar verin.
        </h3>
        <p className="mt-5 max-w-xl text-base leading-7 text-chrome-foreground/70">
          Asistanın nasıl konuştuğunu ve ne zaman sizi devreye aldığını kendiniz görün.
        </p>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <MagneticLink
          href="#dene"
          className="inline-flex rounded-control bg-primary-button px-5 py-3 text-base font-medium text-primary-foreground hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
        >
          Konuşmasını deneyin
        </MagneticLink>
        <a
          href="#panel"
          className="inline-flex rounded-control border border-boundary px-4 py-3 text-base font-medium text-chrome-foreground transition-colors hover:bg-chrome-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Satıcı panelini görün
        </a>
      </div>
    </div>
  );
}
