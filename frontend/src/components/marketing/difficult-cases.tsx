import * as React from "react";

import { ChatProofCard } from "@/components/marketing/chat-bubbles";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * Zor durumlar — the section that earns trust on the error path.
 *
 * People judge automation by how it fails. This section shows the real
 * failure handling: returns/complaints move the conversation into
 * "İade incelemesi" and stop auto-replies; unknown questions are
 * recorded for the seller. No "AI çözer" narrative.
 */
export function DifficultCases() {
  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-20 lg:px-8">
      <MarketingSectionHeading
        eyebrow="Zor durumlar"
        title="Hassas durumlarda sizi devreye alır."
        description="Asistan her şeyi çözmeye çalışmaz. Ne zaman kendisi ilerleyeceğini, ne zaman size bırakacağını bilir."
      />

      <div className="mt-10 grid gap-8 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-10">
        <MarketingReveal>
          <ChatProofCard label="İade akışı — gerçek davranış" className="self-start">
            <FlowStep index="01" label="Müşteri" text="Ürünüm kırık geldi, iade etmek istiyorum." />
            <FlowConnector />
            <FlowStep
              index="02"
              label="Sistem"
              text="Otomatik yanıt durur ve konuşma İade incelemesi durumuna geçer."
              attention
            />
            <FlowConnector />
            <FlowStep
              index="03"
              label="Satıcı"
              text="Panelde İncelemeniz gerekiyor olarak görünür."
              attention
            />
          </ChatProofCard>
        </MarketingReveal>

        <MarketingReveal>
          <div className="overflow-hidden rounded-sheet border border-boundary/60 bg-raised shadow-surface">
            <ul role="list" className="divide-y divide-divider">
              <CaseRow
                title="İade ve sorunlar size düşer"
                body="Hasarlı ürün, yanlış ürün, baskı sorunu, teslimat sorunu — asistan bunları müşteriyle çözmeye çalışmaz; kayıt açar ve inceleme için size bırakır."
              />
              <CaseRow
                title="Bilmediği soruyu fark eder"
                body="Cevaplayamadığı soruyu uydurmak yerine kaydeder ve size iletir. Siz doğru cevabı kaydettiğinizde aynı soruya gelecekte bu cevapla dönebilir."
              />
              <CaseRow
                title="Sınır bilir"
                body="Uygunsuz veya tekrarlayan kötüye kullanımda müşteriyi geçici olarak susturabilir ve sizi bilgilendirir."
              />
              <CaseRow
                title="Devraldığınızda sabit kalır"
                body="Siz ilgilendiğinizi söyleyene kadar konuşma size aittir. Asistan siz bırakana kadar araya girmez."
              />
            </ul>
          </div>
        </MarketingReveal>
      </div>
    </section>
  );
}

function FlowStep({
  index,
  label,
  text,
  attention = false,
}: {
  index: string;
  label: string;
  text: string;
  attention?: boolean;
}) {
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
      <span
        aria-hidden="true"
        className={attention ? "type-meta font-semibold text-attention" : "type-meta font-semibold text-muted-foreground"}
      >
        {index}
      </span>
      <div>
        <p className={attention ? "type-meta font-semibold text-attention" : "type-meta font-semibold text-muted-foreground"}>
          {label}
        </p>
        <p className="mt-0.5 type-body text-foreground">{text}</p>
      </div>
    </div>
  );
}

function FlowConnector() {
  return (
    <div aria-hidden="true" className="ml-4 h-5 w-px bg-divider" />
  );
}

function CaseRow({ title, body }: { title: string; body: string }) {
  return (
    <li className="px-5 py-4 transition-colors duration-150 hover:bg-hover/25">
      <h3 className="type-row-primary text-foreground">{title}</h3>
      <p className="mt-1 max-w-prose type-body text-muted">{body}</p>
    </li>
  );
}
