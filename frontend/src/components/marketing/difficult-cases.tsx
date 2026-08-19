import * as React from "react";

import { ChatProofCard } from "@/components/marketing/chat-bubbles";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * Zor durumlar — the section that earns trust on the error path.
 *
 * People judge automation by how it fails. This section shows the real
 * failure handling: returns/complaints move the conversation into
 * "İade incelemesi" and stop auto-replies; unknown questions are
 * recorded for the seller. No "AI çözer" narrative. The four
 * supporting points are one contiguous ledger, not a stack of cards.
 */
export function DifficultCases() {
  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-20 lg:px-8">
      <MarketingSectionHeading
        eyebrow="Zor durumlar"
        title="Hassas durumlarda sizi devreye alır."
        description="Asistan her şeyi çözmeye çalışmaz. Ne zaman kendisi ilerleyeceğini, ne zaman size bırakacağını bilir."
      />

      <div className="mt-10 grid gap-8 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-10">
        <ChatProofCard label="İade akışı — gerçek davranış" className="self-start">
          <p className="type-meta text-muted-foreground">Müşteri</p>
          <p className="type-body text-foreground">Ürünüm kırık geldi, iade etmek istiyorum.</p>
          <p className="type-meta text-muted-foreground">Sistem</p>
          <p className="type-body text-foreground">
            Konuşma “İade incelemesi” durumuna geçer; bu konuşmada otomatik
            yanıt durur.
          </p>
          <p className="type-meta text-muted-foreground">Siz</p>
          <p className="type-body text-foreground">
            Panelde “İncelemeniz gerekiyor” olarak görürsünüz.
          </p>
        </ChatProofCard>

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
      </div>
    </section>
  );
}

function CaseRow({ title, body }: { title: string; body: string }) {
  return (
    <li className="px-5 py-4">
      <h3 className="type-row-primary text-foreground">{title}</h3>
      <p className="mt-1 max-w-prose type-body text-muted">{body}</p>
    </li>
  );
}
