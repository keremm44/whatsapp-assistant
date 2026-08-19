import * as React from "react";

import { ChatProofCard } from "@/components/marketing/chat-bubbles";
import { MarketingReveal, TrueFocusLine } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";
import { cn } from "@/lib/utils/cn";

/**
 * Kontrol — the trust section. It answers the seller's sharpest
 * objections ("yanlış cevap verir mi?", "kontrolsüz davranır mı?",
 * "mesaj hakkımı tüketir mi?") with the product's real behaviour:
 *
 *   - the decision source is the seller's own data, not free-form AI;
 *   - it never fabricates: unknown questions are recorded and escalated;
 *   - it only replies to what the customer sends (inbound-triggered);
 *   - the seller can take over or hand back any conversation.
 *
 * The right-side proof shows the real control states with the exact
 * tone mapping the seller panel uses: ordinary states are neutral,
 * "İade incelemesi" is coral attention and "Yanıtlar durduruldu" is
 * the near-neutral paused slate. Cyan never expresses a state.
 */
export function ControlSection() {
  return (
    <section id="kontrol" className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-4 py-16 md:px-6 md:py-20 lg:px-8">
      <MarketingSectionHeading
        eyebrow="Kontrol"
        title="Kararları asistan kendi başına vermez."
        description="Yanlış cevap korkusu gerçektir. Bu yüzden asistan yalnızca sizin verdiğiniz bilgilerle konuşur ve bilmediğini söylemekten çekinmez."
      />

      <div className="mt-6 max-w-3xl rounded-sheet border border-boundary/50 bg-sunken px-5 py-4 shadow-surface">
        <p className="mb-3 type-meta font-semibold text-muted-foreground">Çalışma prensibi</p>
        <TrueFocusLine
          words={["Bilir.", "Cevaplar.", "Bilmezse", "durur.", "Size", "bırakır."]}
          className="font-heading text-xl font-semibold leading-8 text-foreground sm:text-2xl"
        />
      </div>

      <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
        <div className="space-y-4">
          <ControlRow
            title="Sadece sizin bilgilerinizle konuşur."
            body="Kararın kaynağı ürün bilgileriniz, kurallarınız, hazır cevaplarınız ve sipariş akışıdır. Yapay zeka yalnızca müşterinin ne sorduğunu ayırt eder; işletmeniz adına karar üretmez."
          />
          <ControlRow
            title="Bilmediğinde uydurmaz."
            body="Kayıtlı bir cevabı yoksa müşteriye bunu söyler ve soruyu size iletir. Soru, panelinizde “Cevaplanamayan sorular” listesine düşer."
          />
          <ControlRow
            title="Gerektiği kadar çalışır."
            body="Yalnızca müşterinin yazdığı mesaja yanıt verir. Kendiliğinden mesaj yağdırmaz, boş yere mesaj hakkı harcamaz."
          />
          <ControlRow
            title="İstediğiniz an devralırsınız."
            body="Bir konuşmaya “Ben ilgileneceğim” diyerek girer, “Asistana bırak” diyerek geri verebilirsiniz. Durum her zaman panelde görünür."
          />
        </div>

        <MarketingReveal>
          <ControlProof />
        </MarketingReveal>
      </div>
    </section>
  );
}

function ControlRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-l-2 border-boundary pl-4 sm:pl-5">
      <h3 className="font-heading text-[17px] font-semibold leading-6 text-foreground">
        {title}
      </h3>
      <p className="mt-1 max-w-2xl type-body text-muted">{body}</p>
    </div>
  );
}

function ControlProof() {
  return (
    <div className="space-y-3 lg:sticky lg:top-20">
      <ChatProofCard label="Konuşma kontrolü — gerçek durumlar">
        <ControlChip label="Asistan aktif" tone="neutral" />
        <ControlChip label="Siz ilgileniyorsunuz" tone="neutral" />
        <ControlChip label="İade incelemesi" tone="attention" />
        <ControlChip label="Yanıtlar durduruldu" tone="paused" />
      </ChatProofCard>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sheet border border-boundary/60 bg-raised px-4 py-3 shadow-surface">
        <span className="type-row-primary text-foreground">
          Bu konuşmayla kim ilgileniyor?
        </span>
        <span className="rounded-control bg-primary-button px-3 py-1.5 text-sm font-medium text-primary-foreground">
          Ben ilgileneceğim
        </span>
      </div>
    </div>
  );
}

function ControlChip({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "attention" | "paused";
}) {
  const chipClass = {
    neutral: "bg-recessed text-foreground",
    attention: "bg-attention-soft text-attention",
    paused: "bg-paused-muted text-paused",
  }[tone];
  const dotClass = {
    neutral: "bg-muted-foreground",
    attention: "bg-attention",
    paused: "bg-paused",
  }[tone];
  return (
    <div
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 type-meta font-semibold",
        chipClass,
      )}
    >
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
      {label}
    </div>
  );
}
