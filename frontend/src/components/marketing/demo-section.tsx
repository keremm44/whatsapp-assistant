"use client";

import * as React from "react";

import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";
import { cn } from "@/lib/utils/cn";

type DemoStep = {
  id: string;
  from: "customer" | "assistant" | "system";
  text: string;
  tone?: "attention" | "neutral";
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
  microwave: { id: "microwave", from: "customer", text: "Kupanız mikrodalgaya girer mi?", replies: [] },
  microwaveAnswer: {
    id: "microwaveAnswer",
    from: "assistant",
    text: "Evet, kupalarımız mikrodalgada kullanılabilir.",
    replies: [
      { label: "Hediye kutusu da gönderiyor musunuz?", next: "unknown" },
      { label: "Ürünüm kırık geldi, iade etmek istiyorum.", next: "return" },
    ],
  },
  price: { id: "price", from: "customer", text: "Fiyatlarınızı nereden görebilirim?", replies: [] },
  priceAnswer: {
    id: "priceAnswer",
    from: "assistant",
    text: "Ürünlerimizi ve fiyatlarını mağazamızdan görüntüleyebilirsiniz.",
    replies: [
      { label: "Hediye kutusu da gönderiyor musunuz?", next: "unknown" },
      { label: "Ürünüm kırık geldi, iade etmek istiyorum.", next: "return" },
    ],
  },
  shipping: { id: "shipping", from: "customer", text: "Kargoya ne zaman verilir?", replies: [] },
  shippingAnswer: {
    id: "shippingAnswer",
    from: "assistant",
    text: "Siparişiniz yaklaşık 2-4 iş günü içinde kargoya verilir.",
    replies: [
      { label: "Hediye kutusu da gönderiyor musunuz?", next: "unknown" },
      { label: "Ürünüm kırık geldi, iade etmek istiyorum.", next: "return" },
    ],
  },
  unknown: { id: "unknown", from: "customer", text: "Hediye kutusu da gönderiyor musunuz?", replies: [] },
  unknownAnswer: {
    id: "unknownAnswer",
    from: "assistant",
    text: "Bu konuda kayıtlı net bir bilgimiz bulunmuyor. Sorunuzu satıcımıza iletiyorum.",
  },
  return: { id: "return", from: "customer", text: "Ürünüm kırık geldi, iade etmek istiyorum.", replies: [] },
  returnOutcome: {
    id: "returnOutcome",
    from: "system",
    tone: "attention",
    text: "Otomatik yanıt durdu. Bu konuşma artık satıcı incelemesinde.",
  },
};

const ANSWER_AFTER: Record<string, string> = {
  microwave: "microwaveAnswer",
  price: "priceAnswer",
  shipping: "shippingAnswer",
  unknown: "unknownAnswer",
  return: "returnOutcome",
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
    <section id="dene" className="scroll-mt-16 border-y border-divider bg-sunken">
      <div className="mx-auto w-full max-w-[1260px] px-4 py-20 md:px-6 md:py-28 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Deneyin"
          title="Nasıl konuştuğunu kendiniz görün."
          description="Bir soru seçin. Normal cevabı da, bilmediği veya durması gereken yeri de aynı konuşmada görün."
        />

        <div className="mt-12 overflow-hidden rounded-sheet border border-boundary/60 bg-raised shadow-surface">
          <div className="flex items-center justify-between gap-3 border-b border-divider px-4 py-3 sm:px-6">
            <p className="type-meta font-semibold text-muted-foreground">Kişiye özel kupa mağazası · örnek konuşma</p>
            <button type="button" onClick={reset} className="rounded-control px-2.5 py-1 type-meta font-semibold text-primary transition-colors hover:bg-primary-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Yeniden başlat
            </button>
          </div>

          <div className="flex min-h-[430px] flex-col justify-end gap-3 px-4 py-6 sm:px-8 sm:py-8">
            {history.map((stepId) => {
              const step = DEMO_STEPS[stepId];
              if (step.from === "system") return <SystemNote key={stepId} step={step} />;
              return <ChatBubble key={stepId} from={step.from}>{step.text}</ChatBubble>;
            })}
          </div>

          <div className="border-t border-divider bg-sunken px-4 py-4 sm:px-8">
            {!isAtLeaf ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Müşteri soruları">
                {current.replies?.map((reply) => (
                  <button
                    key={reply.next}
                    type="button"
                    onClick={() => choose(reply.next)}
                    className={cn(
                      "rounded-control border border-boundary/60 bg-raised px-3 py-2 text-sm font-medium text-foreground",
                      "transition-colors hover:bg-primary-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    )}
                  >
                    {reply.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="type-meta text-muted-foreground">Başka bir senaryoyu da deneyebilirsiniz.</p>
                <button type="button" onClick={reset} className="rounded-control px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  Yeniden başlat
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 type-meta text-muted-foreground">
          Bu alan canlı yapay zeka bağlantısı değil; ürünün gerçek konuşma ve devretme davranışlarını gösteren kontrollü bir örnektir.
        </p>
      </div>
    </section>
  );
}

function SystemNote({ step }: { step: DemoStep }) {
  const attention = step.tone === "attention";
  return (
    <div className={cn("rounded-control border-l-[3px] px-3.5 py-3", attention ? "border-l-attention bg-attention-soft" : "border-l-boundary bg-recessed")}>
      <p className={cn("type-meta font-semibold", attention ? "text-attention" : "text-muted-foreground")}>Sistem</p>
      <p className="mt-1 type-body text-foreground">{step.text}</p>
    </div>
  );
}
