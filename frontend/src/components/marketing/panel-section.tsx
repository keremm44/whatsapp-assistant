import * as React from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { ChatBubble } from "@/components/marketing/chat-bubbles";
import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";
import { StatusChip } from "@/components/shared/status-chip";

export function PanelSection() {
  return (
    <section id="panel" className="scroll-mt-20 bg-canvas">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-20 md:px-6 md:py-28 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Panel"
          title="Durduğu konuşma kaybolmaz. Önünüze gelir."
          description="Müşteri mesajını, neden durduğunu ve sizden ne beklendiğini aynı çalışma yüzeyinde görürsünüz."
        />

        <MarketingReveal className="mt-12">
          <SellerWorkbenchProof />
        </MarketingReveal>
      </div>
    </section>
  );
}

function SellerWorkbenchProof() {
  return (
    <div className="min-h-[460px] overflow-hidden rounded-sheet border border-boundary/70 bg-chrome shadow-surface">
      <div className="border-b border-divider bg-chrome px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="type-meta font-semibold text-chrome-foreground/62">Satıcı paneli</p>
            <h3 className="mt-1.5 font-heading text-2xl font-semibold tracking-[-0.02em] text-chrome-foreground sm:text-[30px]">
              Bugün ilgilenmeniz gerekenler
            </h3>
          </div>

          <div className="flex flex-wrap items-end gap-6 sm:gap-8">
            <WorkloadLabel label="Önce bakılacaklar" active />
            <WorkloadLabel label="Vakit varsa" />
            <WorkloadLabel label="Toplam" />
          </div>
        </div>
      </div>

      <div className="grid min-h-[370px] lg:grid-cols-[minmax(0,0.9fr)_72px_minmax(0,1.1fr)]">
        <div className="border-b border-divider bg-sunken p-5 sm:p-7 lg:border-b-0 lg:border-r">
          <p className="type-eyebrow text-muted-foreground">Konuşma</p>
          <p className="mt-2 type-meta font-semibold text-foreground">
            {MARKETING_STORY.storeLabel}
          </p>

          <div className="mt-6 space-y-4">
            <ChatBubble from="customer">{MARKETING_STORY.returnQuestion}</ChatBubble>
            <div className="rounded-control border-l-[3px] border-l-attention bg-attention-soft px-3.5 py-3">
              <p className="type-meta font-semibold text-attention">Otomatik yanıt durdu</p>
              <p className="mt-1 type-row-secondary text-foreground">
                Konuşma iade incelemesine geçti.
              </p>
            </div>
          </div>
        </div>

        <div className="relative hidden items-center justify-center border-r border-divider bg-chrome lg:flex">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-attention/25 bg-attention-soft text-attention">
            <ArrowRight aria-hidden="true" size={18} strokeWidth={1.8} />
          </span>
        </div>

        <div className="bg-sunken">
          <div className="border-b border-divider px-5 py-5 sm:px-7">
            <p className="type-eyebrow text-muted-foreground">Önce bunlar</p>
          </div>

          <article className="group relative bg-raised transition-colors duration-200 hover:bg-elevated/50">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-5 sm:p-7">
              <div className="flex min-w-0 flex-1 items-start gap-4 sm:gap-5">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-boundary/40 bg-recessed text-muted-foreground transition-colors group-hover:bg-hover group-hover:text-foreground"
                >
                  ↩
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="type-meta text-muted-foreground">İade</span>
                    <StatusChip tone="attention">İncelemeniz gerekiyor</StatusChip>
                  </div>
                  <h4 className="type-record-identity text-foreground">İade incelemesi</h4>
                  <p className="type-body text-foreground">{MARKETING_STORY.returnQuestion}</p>
                  <p className="type-row-secondary text-muted-foreground">
                    {MARKETING_STORY.storeLabel}
                  </p>
                </div>
              </div>

              <a
                href="#dene"
                className="inline-flex h-11 shrink-0 items-center gap-1.5 self-start rounded-control px-2 type-row-secondary font-semibold text-primary transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sunken sm:h-9"
              >
                <span>Konuşmayı görün</span>
                <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.9} />
              </a>
            </div>
          </article>

          <div className="border-t border-divider px-5 py-5 sm:px-7">
            <p className="max-w-xl type-row-secondary text-muted">
              Aynı müşteri mesajı ve aynı iade durumu, ayrı bir açıklama aramadan çalışma listenizde görünür.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkloadLabel({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div className="relative pb-1">
      <p
        className={
          active
            ? "type-meta font-semibold text-chrome-foreground"
            : "type-meta text-chrome-foreground/48"
        }
      >
        {label}
      </p>
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-0.5 h-px bg-primary"
        />
      ) : null}
    </div>
  );
}
