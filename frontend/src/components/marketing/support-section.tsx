import * as React from "react";

import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * Support — a quiet risk-reducer, followed by one real next step: return
 * to the product conversation. No application/signup flow is implied.
 */
export function SupportSection() {
  return (
    <section className="border-t border-divider bg-sunken">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-20 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Yanınızdayız"
          title="Kurulumdan sonra da ne olduğunu görürsünüz."
          description="Panel içindeki geri bildirim ve duyuru kanalları, sorunları ve önemli gelişmeleri aynı ürün yüzeyinde takip etmenizi sağlar."
        />

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div className="overflow-hidden rounded-sheet border border-boundary/60 bg-raised shadow-surface">
            <ul role="list" className="divide-y divide-divider">
              <SupportRow
                title="Panelin içinde"
                body="Öneri, sorun veya şikayetinizi panelden iletir; durumunu aynı yerde takip edersiniz."
              />
              <SupportRow
                title="Duyurular"
                body="Önemli gelişmeler ve sistem bilgilendirmeleri doğrudan panelinizde görünür."
              />
              <SupportRow
                title="Canlıdan önce test"
                body="Asistan müşteriye açılmadan önce test sohbetinde nasıl davrandığını siz görürsünüz."
              />
            </ul>
          </div>

          <div className="border-l-2 border-primary/55 pl-5">
            <p className="font-heading text-xl font-semibold leading-8 text-foreground">
              En iyi kanıt, konuşmayı kendiniz görmek.
            </p>
            <a
              href="#dene"
              className="mt-4 inline-flex rounded-control bg-primary-button px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sunken"
            >
              Konuşmasına dönün
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function SupportRow({ title, body }: { title: string; body: string }) {
  return (
    <li className="px-5 py-4">
      <h3 className="type-row-primary text-foreground">{title}</h3>
      <p className="mt-1 max-w-prose type-body text-muted">{body}</p>
    </li>
  );
}
