import * as React from "react";

import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * Destek — the risk-reducer placed late, after the seller has started to
 * want the product. It represents only the support model the product
 * actually provides: the WhatsApp suitability interview after applying,
 * the in-panel feedback channel with tracked status, and announcements.
 * No "7/24 canlı destek" or phone-support promises are invented.
 */
export function SupportSection() {
  return (
    <section className="border-t border-divider bg-chrome/60">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-20 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Yanınızdayız"
          title="Yalnız kalmazsınız."
          description="Başvurudan kuruluma ve sonrasına kadar, sizi dinleyen gerçek bir kanal her zaman vardır."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <SupportColumn
            title="Başvurudan itibaren"
            body="Başvurunuz alındıktan sonra uygunluk görüşmesi için size WhatsApp üzerinden ulaşırız."
          />
          <SupportColumn
            title="Panelin içinde"
            body="Öneri, sorun veya şikayetinizi panelden iletirsiniz; durumu “Gönderildi → İnceleniyor → Çözüldü” olarak takip edersiniz."
          />
          <SupportColumn
            title="Duyurular"
            body="Önemli gelişmeler ve sistem bilgilendirmeleri doğrudan panelinizden duyurulur."
          />
        </div>
      </div>
    </section>
  );
}

function SupportColumn({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-sheet border border-boundary/60 bg-surface p-5 shadow-surface">
      <h3 className="type-row-primary text-foreground">{title}</h3>
      <p className="mt-1.5 type-body text-muted">{body}</p>
    </div>
  );
}
