"use client";

import * as React from "react";

import { ChatBubble, ChatNote } from "@/components/marketing/chat-bubbles";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";
import { cn } from "@/lib/utils/cn";

/**
 * "Müşteri gibi deneyin" — a scripted, offline conversation sample.
 *
 * This is NOT a live model: the replies are the product's real template
 * / product-info / escalation sentences, replayed so the seller hears
 * the assistant's actual tone and sees its actual limits. The label is
 * honest about this on purpose.
 */

type DemoStep = {
  id: string;
  from: "customer" | "assistant";
  text: string;
  note?: string;
  replies?: { label: string; next: string }[];
};

const DEMO_STEPS: Record<string, DemoStep> = {
  start: {
    id: "start",
    from: "assistant",
    text: "Merhaba, size nasıl yardımcı olabilirim?",
    replies: [
      { label: "Kupanız mikrodalgaya girer mi?", next: "microwave" },
      { label: "Fiyatlarınızı nereden görebilirim?", next: "price" },
      { label: "Kargoya ne zaman verilir?", next: "shipping" },
    ],
  },
  microwave: {
    id: "microwave",
    from: "customer",
    text: "Kupanız mikrodalgaya girer mi?",
    replies: [],
  },
  microwaveAnswer: {
    id: "microwaveAnswer",
    from: "assistant",
    text: "Evet, kupalarımız mikrodalgada kullanılabilir.",
    replies: [
      { label: "Hediye kutusu da gönderiyor musunuz?", next: "unknown" },
      { label: "Ürünüm kırık geldi, iade etmek istiyorum.", next: "return" },
    ],
  },
  price: {
    id: "price",
    from: "customer",
    text: "Fiyatlarınızı nereden görebilirim?",
    replies: [],
  },
  priceAnswer: {
    id: "priceAnswer",
    from: "assistant",
    text: "Ürünlerimizi ve fiyatlarını mağazamızdan görüntüleyebilirsiniz.",
    replies: [
      { label: "Hediye kutusu da gönderiyor musunuz?", next: "unknown" },
      { label: "Ürünüm kırık geldi, iade etmek istiyorum.", next: "return" },
    ],
  },
  shipping: {
    id: "shipping",
    from: "customer",
    text: "Kargoya ne zaman verilir?",
    replies: [],
  },
  shippingAnswer: {
    id: "shippingAnswer",
    from: "assistant",
    text: "Siparişiniz yaklaşık 2-4 iş günü içinde kargoya verilir.",
    replies: [
      { label: "Hediye kutusu da gönderiyor musunuz?", next: "unknown" },
      { label: "Ürünüm kırık geldi, iade etmek istiyorum.", next: "return" },
    ],
  },
  unknown: {
    id: "unknown",
    from: "customer",
    text: "Hediye kutusu da gönderiyor musunuz?",
    replies: [],
  },
  unknownAnswer: {
    id: "unknownAnswer",
    from: "assistant",
    text: "Bu konuda kayıtlı net bir bilgimiz bulunmuyor. Sorunuzu satıcımıza iletiyorum.",
    note: "Soru, panelde “Cevaplanamayan sorular” listesine düşer; asistan cevap uydurmaz.",
  },
  return: {
    id: "return",
    from: "customer",
    text: "Ürünüm kırık geldi, iade etmek istiyorum.",
    replies: [],
  },
  returnAnswer: {
    id: "returnAnswer",
    from: "assistant",
    text: "Bu konuşma satıcı incelemesine bırakıldı.",
    note: "Asistan bu konuşmada otomatik yanıtı durdurur; konuşma size “İade incelemesi” olarak düşer.",
  },
};

/** Which step follows a chosen customer reply. */
const ANSWER_AFTER: Record<string, string> = {
  microwave: "microwaveAnswer",
  price: "priceAnswer",
  shipping: "shippingAnswer",
  unknown: "unknownAnswer",
  return: "returnAnswer",
};

export function DemoSection() {
  const [history, setHistory] = React.useState<string[]>(["start"]);

  const currentId = history[history.length - 1];
  const current = DEMO_STEPS[currentId];

  const choose = (next: string) => {
    const replyTarget = ANSWER_AFTER[next] ?? next;
    setHistory((prev) => [...prev, next, replyTarget]);
  };

  const reset = () => setHistory(["start"]);

  const isAtLeaf = !current?.replies || current.replies.length === 0;

  return (
    <section id="dene" className="border-y border-divider bg-chrome/60 scroll-mt-16">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-20 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Deneyin"
          title="Nasıl konuştuğunu kendiniz görün."
          description="Müşteri gibi birkaç soru sorun. Cevaplar ürünün gerçek davranışını yansıtır — sınırlarıyla birlikte."
        />

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
          <div className="overflow-hidden rounded-sheet border border-boundary/60 bg-surface shadow-surface">
            <div className="flex items-center justify-between gap-3 border-b border-divider px-4 py-2.5">
              <p className="type-meta font-semibold text-muted-foreground">
                Kişiye özel kupa mağazası — örnek konuşma
              </p>
              <button
                type="button"
                onClick={reset}
                className="rounded-control px-2.5 py-1 type-meta font-semibold text-primary transition-colors hover:bg-primary-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Yeniden başlat
              </button>
            </div>
            <div className="flex min-h-[360px] flex-col justify-end gap-3 px-4 py-5">
              {history.map((stepId) => {
                const step = DEMO_STEPS[stepId];
                return (
                  <div key={stepId} className="space-y-1.5">
                    <ChatBubble from={step.from}>{step.text}</ChatBubble>
                    {step.note ? <ChatNote>{step.note}</ChatNote> : null}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-divider bg-recessed/40 px-4 py-3.5">
              {!isAtLeaf ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Müşteri soruları">
                  {current.replies?.map((reply) => (
                    <button
                      key={reply.next}
                      type="button"
                      onClick={() => choose(reply.next)}
                      className={cn(
                        "rounded-control border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground",
                        "transition-colors hover:bg-primary-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      )}
                    >
                      {reply.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="type-meta text-muted-foreground">
                    Bu senaryo bitti. Başka bir soruyla yeniden deneyin.
                  </p>
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-control px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Yeniden başlat
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 lg:pt-10">
            <p className="type-meta font-semibold uppercase tracking-[0.09em] text-primary-text">
              Dürüstlük notu
            </p>
            <p className="type-body text-muted">
              Bu örnek konuşma, canlı bir yapay zeka bağlantısı kullanmaz.
              Cevaplar ürünün gerçek şablonları, ürün bilgisi yanıtları ve
              satıcıya devretme davranışıdır — birebir ürünün içinde nasıl
              yazıldığıyla aynı metinlerdir.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
