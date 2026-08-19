import * as React from "react";

import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * Destek — the risk-reducer placed late, after the seller has started to
 * want the product. It represents only the support model the product
 * actually provides: the in-panel feedback channel with tracked status,
 * and announcements. No "7/24 canlı destek" or phone-support promises
 * are invented. One contiguous ledger, not a gallery of cards.
 */
export function SupportSection() {
  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-20 lg:px-8">
      <MarketingSectionHeading
        eyebrow="Yanınızdayız"
        title="Yalnız kalmazsınız."
        description="Kurulumda veya sonrasında bir şey olduğunda, sizi dinleyen gerçek bir kanal her zaman vardır."
      />

      <div className="mt-10 overflow-hidden rounded-sheet border border-boundary/60 bg-raised shadow-surface">
        <ul role="list" className="divide-y divide-divider">
          <SupportRow
            title="Panelin içinde"
            body="Öneri, sorun veya şikayetinizi panelden iletirsiniz; durumu “Gönderildi → İnceleniyor → Çözüldü” olarak takip edersiniz."
          />
          <SupportRow
            title="Duyurular"
            body="Önemli gelişmeler ve sistem bilgilendirmeleri doğrudan panelinizden duyurulur."
          />
          <SupportRow
            title="Kurulum yanınızda"
            body="İşletmenizi hazırlarken ve canlıya çıkmadan önce test aşamasında yalnız bırakılmazsınız."
          />
        </ul>
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
