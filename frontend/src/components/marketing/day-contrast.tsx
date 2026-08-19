import * as React from "react";

import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * "Şimdi / Asistanla" — the value section that answers
 * "bu gerçekten işimi azaltır mı, yoksa yönetmem gereken yeni bir
 * yazılım mı?" by contrasting the seller's day, not by listing features.
 *
 * The two columns are ledger-like lists separated by rules — no badges,
 * no metrics, no invented numbers, and no success/warning hues (colour
 * states are reserved for real record states in the product).
 */
export function DayContrast() {
  return (
    <section id="nasil-calisir" className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-4 py-16 md:px-6 md:py-20 lg:px-8">
      <MarketingSectionHeading
        eyebrow="Yük"
        title="Telefonun başına bağlayan işleri ayırın."
        description="Asistan tekrar eden konuşmaları üstlenir. Siz yalnızca gerçekten size ihtiyaç duyulan yerde devreye girersiniz."
      />

      <MarketingReveal className="mt-10 grid gap-6 lg:grid-cols-2 lg:gap-8">
        <ContrastColumn
          label="Asistansız"
          items={[
            "Aynı sorulara gün boyu aynı cevaplar",
            "Sipariş, kargo ve ürün bilgisi telefonun başında bekler",
            "Müşteri cevap beklerken siz başka işle ilgilenemezsiniz",
            "Gece gelen mesaj sabaha kadar yarım kalır",
          ]}
        />
        <ContrastColumn
          label="Asistanla"
          items={[
            "Sık sorulan sorular kayıtlı bilgilerle otomatik olarak yanıtlanır",
            "Sipariş ve kargo akışı konuşma içinde ilerler",
            "Siz yalnızca gerçekten gereken yerde devreye girersiniz",
            "Panel size bakılması gerekeni öncelik sırasıyla gösterir",
          ]}
        />
      </MarketingReveal>
    </section>
  );
}

function ContrastColumn({
  label,
  items,
}: {
  label: string;
  items: string[];
}) {
  return (
    <div className="overflow-hidden rounded-sheet border border-boundary/60 bg-raised shadow-surface">
      <p className="border-b border-divider px-5 py-3 type-meta font-semibold text-muted-foreground">
        {label}
      </p>
      <ul role="list" className="divide-y divide-divider">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-3 px-5 py-3.5 type-body text-foreground"
          >
            <span
              aria-hidden="true"
              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
