import * as React from "react";

import { MagneticLink, MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * Support — continuity stays quiet; the final decision moment gets the
 * visual weight. No signup promise is introduced while applications are
 * intentionally closed.
 */
export function SupportSection() {
  return (
    <section className="border-t border-divider bg-sunken">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-24 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Yanınızdayız"
          title="Kurulumdan sonra da ne olduğunu görürsünüz."
          description="Sorunları, geri bildirimlerinizi ve önemli gelişmeleri panelin içinden takip edersiniz; sistem size görünmez bir kutu gibi davranmaz."
        />

        <div className="mt-12 grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-stretch lg:gap-10">
          <MarketingReveal>
            <SupportContinuity />
          </MarketingReveal>
          <MarketingReveal>
            <FinalProof />
          </MarketingReveal>
        </div>
      </div>
    </section>
  );
}

function SupportContinuity() {
  return (
    <div className="h-full overflow-hidden rounded-sheet border border-boundary/60 bg-raised shadow-surface">
      <SupportRow
        index="01"
        title="Panelden yazın"
        body="Öneri, sorun veya şikayetinizi aynı ürün yüzeyinden iletin; durumunu oradan takip edin."
      />
      <SupportRow
        index="02"
        title="Gelişmeleri görün"
        body="Önemli sistem bilgilendirmeleri ve duyurular panelinizde görünür."
      />
      <SupportRow
        index="03"
        title="Canlıdan önce deneyin"
        body="Asistan müşteriye açılmadan önce nasıl cevap verdiğini ve ne zaman durduğunu siz görün."
        last
      />
    </div>
  );
}

function FinalProof() {
  return (
    <div className="relative flex h-full min-h-[330px] flex-col justify-between overflow-hidden rounded-sheet border border-primary/25 bg-chrome px-6 py-7 shadow-surface sm:px-8 sm:py-9">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full border border-identity/15 bg-identity/5 blur-3xl"
      />

      <div className="relative max-w-xl">
        <p className="type-meta font-semibold text-primary">Son karar sizde</p>
        <h3 className="mt-4 font-display text-[34px] font-semibold leading-[40px] tracking-[-0.025em] text-chrome-foreground sm:text-[42px] sm:leading-[48px]">
          Önce görün. Sonra karar verin.
        </h3>
        <p className="mt-4 max-w-lg text-base leading-7 text-chrome-foreground/68">
          Asistanın bildiği soruya nasıl cevap verdiğini, bilmediği yerde nasıl durduğunu ve ne zaman sizi devreye aldığını kendiniz görün.
        </p>
      </div>

      <div className="relative mt-9 flex flex-wrap items-center gap-3">
        <MagneticLink
          href="#dene"
          className="inline-flex rounded-control bg-primary-button px-5 py-3 text-base font-medium text-primary-foreground hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
        >
          Konuşmasını deneyin
        </MagneticLink>
        <a
          href="#panel"
          className="inline-flex rounded-control border border-chrome-foreground/15 px-4 py-3 text-base font-medium text-chrome-foreground/78 transition-colors hover:border-primary/35 hover:bg-chrome-hover hover:text-chrome-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Satıcı panelini görün
        </a>
      </div>
    </div>
  );
}

function SupportRow({
  index,
  title,
  body,
  last = false,
}: {
  index: string;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <div className={last ? "grid grid-cols-[34px_minmax(0,1fr)] gap-3 px-5 py-5" : "grid grid-cols-[34px_minmax(0,1fr)] gap-3 border-b border-divider px-5 py-5"}>
      <span className="type-meta mt-0.5 font-semibold text-muted-foreground">{index}</span>
      <div>
        <h3 className="type-row-primary text-foreground">{title}</h3>
        <p className="mt-1.5 type-body text-muted">{body}</p>
      </div>
    </div>
  );
}
