import * as React from "react";

import { ChatProofCard } from "@/components/marketing/chat-bubbles";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

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
 * The right-side proof shows the real control states and the single
 * handoff action exactly as the panel presents them.
 */
export function ControlSection() {
  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-20 lg:px-8">
      <MarketingSectionHeading
        eyebrow="Kontrol"
        title="Kararları asistan kendi başına vermez."
        description="Yanlış cevap korkusu gerçektir. Bu yüzden asistan yalnızca sizin verdiğiniz bilgilerle konuşur ve bilmediğini söylemekten çekinmez."
      />

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

        <ControlProof />
      </div>
    </section>
  );
}

function ControlRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-l-2 border-primary-muted pl-4 sm:pl-5">
      <h3 className="font-heading text-[17px] font-semibold leading-6 text-foreground">
        {title}
      </h3>
      <p className="mt-1 max-w-2xl type-body text-muted">{body}</p>
    </div>
  );
}

/**
 * The real control surface, rendered as a quiet proof artifact. The chip
 * labels are the backend's own display names; the single action follows
 * the V1 handoff model ("Ben ilgileneceğim" when the assistant is
 * active). This is a mockup derived from the real conversation header.
 */
function ControlProof() {
  return (
    <div className="space-y-3 lg:sticky lg:top-20">
      <ChatProofCard label="Konuşma kontrolü — gerçek durumlar">
        <ControlChip label="Asistan aktif" tone="active" />
        <ControlChip label="Siz ilgileniyorsunuz" tone="taken" />
        <ControlChip label="İade incelemesi" tone="review" />
        <ControlChip label="Yanıtlar durduruldu" tone="paused" />
      </ChatProofCard>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sheet border border-boundary/60 bg-surface px-4 py-3 shadow-surface">
        <span className="type-row-primary text-foreground">Bu konuşmayla kim ilgileniyor?</span>
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
  tone: "active" | "taken" | "review" | "paused";
}) {
  const dotClass = {
    active: "bg-primary",
    taken: "bg-info",
    review: "bg-attention",
    paused: "bg-paused",
  }[tone];
  return (
    <div className="flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-2">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      <span className="type-row-secondary font-semibold text-foreground">{label}</span>
    </div>
  );
}
