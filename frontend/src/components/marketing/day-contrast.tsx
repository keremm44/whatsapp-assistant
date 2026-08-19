import * as React from "react";

import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * "Şimdi / Asistanla" — the value section that answers
 * "bu gerçekten işimi azaltır mı, yoksa yönetmem gereken yeni bir
 * yazılım mı?" by contrasting the seller's day, not by listing features.
 *
 * The two columns are ledger-like lists separated by rules — no badges,
 * no metrics, no invented numbers.
 */
export function DayContrast() {
  return (
    <section className="border-y border-divider bg-chrome/60">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-20 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Yük"
          title="Telefonun başına bağlayan işleri ayırın."
          description="Asistan tekrar eden konuşmaları üstlenir. Siz yalnızca gerçekten size ihtiyaç duyulan yerde devreye girersiniz."
        />

        <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:gap-8">
          <ContrastColumn
            tone="before"
            label="Asistansız"
            items={[
              "Aynı sorulara gün boyu aynı cevaplar",
              "Sipariş, kargo ve ürün bilgisi telefonun başında bekler",
              "Müşteri cevap beklerken siz başka işle ilgilenemezsiniz",
              "Gece gelen mesaj sabaha kadar yarım kalır",
            ]}
          />
          <ContrastColumn
            tone="after"
            label="Asistanla"
            items={[
              "Sık sorulan sorular kayıtlı bilgilerle otomatik olarak yanıtlanır",
              "Sipariş ve kargo akışı konuşma içinde ilerler",
              "Siz yalnızca gerçekten gereken yerde devreye girersiniz",
              "Panel size bakılması gerekeni öncelik sırasıyla gösterir",
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function ContrastColumn({
  label,
  tone,
  items,
}: {
  label: string;
  tone: "before" | "after";
  items: string[];
}) {
  return (
    <div className="overflow-hidden rounded-sheet border border-boundary/60 bg-surface shadow-surface">
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
              className={
                tone === "before"
                  ? "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40"
                  : "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-success"
              }
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
