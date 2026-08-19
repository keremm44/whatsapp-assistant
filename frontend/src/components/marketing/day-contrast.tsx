import * as React from "react";

import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * Value contrast — deliberately asymmetric. "Asistansız" is compressed
 * and task-heavy; "Asistanla" gets more room and real product artefacts
 * so the improvement is felt before it is read. Colour semantics stay
 * neutral: no invented success green or warning state.
 */
export function DayContrast() {
  return (
    <section
      id="nasil-calisir"
      className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-4 py-16 md:px-6 md:py-24 lg:px-8"
    >
      <MarketingSectionHeading
        eyebrow="Yük"
        title="Telefonun başına bağlayan işleri ayırın."
        description="Asistan tekrar eden konuşmaları üstlenir. Siz yalnızca gerçekten size ihtiyaç duyulan yerde devreye girersiniz."
      />

      <div className="mt-12 grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-stretch lg:gap-8">
        <MarketingReveal>
          <WithoutAssistant />
        </MarketingReveal>
        <MarketingReveal>
          <WithAssistant />
        </MarketingReveal>
      </div>
    </section>
  );
}

function WithoutAssistant() {
  const items = [
    "Aynı sorulara gün boyu aynı cevaplar",
    "Sipariş, kargo ve ürün bilgisi telefonun başında bekler",
    "Müşteri cevap beklerken siz başka işe geçemezsiniz",
    "Gece gelen mesaj sabaha kadar yarım kalır",
  ];

  return (
    <div className="h-full overflow-hidden rounded-sheet border border-boundary/55 bg-recessed/75 shadow-surface">
      <div className="border-b border-divider px-5 py-4">
        <p className="type-meta font-semibold text-muted-foreground">Asistansız</p>
        <p className="mt-1 font-heading text-lg font-semibold text-foreground">
          Her konuşma yeniden sizin masanıza gelir.
        </p>
      </div>
      <ul role="list" className="divide-y divide-divider/80">
        {items.map((item, index) => (
          <li key={item} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 px-5 py-4">
            <span
              aria-hidden="true"
              className="type-meta mt-0.5 font-semibold text-muted-foreground/65"
            >
              0{index + 1}
            </span>
            <span className="type-body text-muted">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WithAssistant() {
  return (
    <div className="h-full overflow-hidden rounded-sheet border border-primary/25 bg-raised shadow-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-divider bg-chrome/35 px-5 py-4 sm:px-6">
        <div>
          <p className="type-meta font-semibold text-primary">Asistanla</p>
          <p className="mt-1 font-heading text-xl font-semibold tracking-[-0.015em] text-foreground">
            Tekrar eden iş akar; size gereken yer ayrılır.
          </p>
        </div>
        <span className="rounded-control border border-primary/30 bg-selected/60 px-2.5 py-1 type-meta font-semibold text-primary">
          Kontrol sizde
        </span>
      </div>

      <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2">
        <ProductArtefact
          eyebrow="Müşteri sorusu"
          title="Kupanız mikrodalgaya girer mi?"
          body="Kayıtlı ürün bilgisi varsa asistan konuşma içinde yanıt verir."
          emphasis="Asistan yanıtı"
        />
        <ProductArtefact
          eyebrow="Bilinmeyen konu"
          title="Hediye kutusu da gönderiyor musunuz?"
          body="Kayıtlı cevap yoksa uydurmaz; soru satıcının listesine taşınır."
          emphasis="Cevaplanamayan soru"
        />
        <ProductArtefact
          eyebrow="Satıcı müdahalesi"
          title="Ürünüm kırık geldi, iade etmek istiyorum."
          body="Otomatik yanıt durur ve inceleme gereken kayıt görünür hale gelir."
          emphasis="İncelemeniz gerekiyor"
          attention
          className="md:col-span-2"
        />
      </div>
    </div>
  );
}

function ProductArtefact({
  eyebrow,
  title,
  body,
  emphasis,
  attention = false,
  className,
}: {
  eyebrow: string;
  title: string;
  body: string;
  emphasis: string;
  attention?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-sheet border border-boundary/60 bg-sunken px-4 py-4 transition-[border-color,background-color] duration-200 hover:border-primary/30 hover:bg-recessed/75 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-meta font-semibold text-muted-foreground">{eyebrow}</p>
        <span
          className={
            attention
              ? "rounded-control bg-attention-soft px-2 py-1 type-meta font-semibold text-attention"
              : "rounded-control bg-selected/65 px-2 py-1 type-meta font-semibold text-primary"
          }
        >
          {emphasis}
        </span>
      </div>
      <p className="mt-3 type-row-primary text-foreground">{title}</p>
      <p className="mt-1.5 type-row-secondary text-muted">{body}</p>
    </div>
  );
}
