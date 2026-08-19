import * as React from "react";

import { ChatProofCard } from "@/components/marketing/chat-bubbles";
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

        <div className="grid gap-4 sm:grid-cols-2">
          <CaseCard
            title="İade ve sorunlar size düşer"
            body="Hasarlı ürün, yanlış ürün, baskı sorunu, teslimat sorunu — asistan bunları müşteriyle çözmeye çalışmaz; kayıt açar ve inceleme için size bırakır."
          />
          <CaseCard
            title="Bilmediği soruyu fark eder"
            body="Cevaplayamadığı soruyu uydurmak yerine kaydeder ve size iletir. Siz yanıtladığınızda aynı soruya gelecekte bu yanıtla döner."
          />
          <CaseCard
            title="Sınır bilir"
            body="Uygunsuz veya tekrarlayan kötüye kullanımda müşteriyi geçici olarak susturabilir ve sizi bilgilendirir."
          />
          <CaseCard
            title="Devraldığınızda sabit kalır"
            body="Siz ilgilendiğinizi söyleyene kadar konuşma size aittir. Asistan siz bırakana kadar araya girmez."
          />
        </div>
      </div>
    </section>
  );
}

function CaseCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-sheet border border-boundary/60 bg-surface p-5 shadow-surface">
      <h3 className="font-heading text-[16px] font-semibold leading-6 text-foreground">
        {title}
      </h3>
      <p className="mt-1.5 type-body text-muted">{body}</p>
    </div>
  );
}
