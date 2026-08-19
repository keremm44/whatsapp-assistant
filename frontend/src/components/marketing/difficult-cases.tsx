import * as React from "react";

import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * Difficult cases — the same conversation reaches the moment where the
 * assistant must stop. Coral appears only on the seller-attention path.
 */
export function DifficultCases() {
  return (
    <section className="border-y border-divider bg-sunken">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-24 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Zor durumlar"
          title="Her şeyi çözmeye çalışmaz. Gerektiğinde durur."
          description="İade, sorun veya kayıtlı cevabı olmayan bir konu geldiğinde sınırını belli eder ve satıcı müdahalesini görünür hale getirir."
        />

        <MarketingReveal className="mt-12">
          <ReturnHandoffPath />
        </MarketingReveal>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <QuietCase
            title="Bilinmeyen soru"
            body="Kayıtlı cevap yoksa soru cevaplanamayan sorular listesine düşer; asistan yeni bir işletme kuralı üretmez."
          />
          <QuietCase
            title="Satıcı devralması"
            body="Siz konuşmayı devraldığınızda asistan araya girmez; konuşma yeniden bırakılana kadar sizde kalır."
          />
        </div>
      </div>
    </section>
  );
}

function ReturnHandoffPath() {
  const steps = [
    {
      index: "01",
      label: "Müşteri",
      text: MARKETING_STORY.returnQuestion,
      attention: false,
    },
    {
      index: "02",
      label: "Sistem",
      text: MARKETING_STORY.returnSystemOutcome,
      attention: true,
    },
    {
      index: "03",
      label: "Satıcı görünürlüğü",
      text: MARKETING_STORY.returnSellerOutcome,
      attention: true,
    },
  ] as const;

  return (
    <div className="overflow-hidden rounded-sheet border border-boundary/70 bg-raised shadow-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider bg-chrome/45 px-4 py-3 sm:px-5">
        <div>
          <p className="type-meta font-semibold text-foreground">Aynı konuşma · iade yolu</p>
          <p className="mt-0.5 type-meta text-muted-foreground">
            {MARKETING_STORY.storeLabel}
          </p>
        </div>
        <span className="rounded-control bg-attention-soft px-2.5 py-1 type-meta font-semibold text-attention">
          İade incelemesi
        </span>
      </div>

      <ol className="grid md:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.index}
            className="relative border-b border-divider px-5 py-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className={
                  step.attention
                    ? "type-meta font-semibold text-attention"
                    : "type-meta font-semibold text-muted-foreground"
                }
              >
                {step.index} · {step.label}
              </span>
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className="hidden text-muted-foreground md:block">
                  →
                </span>
              ) : null}
            </div>
            <p className="mt-3 type-body text-foreground">{step.text}</p>
            {step.attention ? (
              <span aria-hidden="true" className="mt-5 block h-0.5 w-12 bg-attention" />
            ) : (
              <span aria-hidden="true" className="mt-5 block h-px w-12 bg-divider" />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function QuietCase({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-l-2 border-boundary pl-4 sm:pl-5">
      <h3 className="type-row-primary text-foreground">{title}</h3>
      <p className="mt-1 max-w-prose type-body text-muted">{body}</p>
    </div>
  );
}
