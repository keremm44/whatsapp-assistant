import * as React from "react";
import { ArrowUpRight } from "lucide-react";

import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";
import { StatusChip } from "@/components/shared/status-chip";

export function PanelSection() {
  return (
    <section id="panel" className="scroll-mt-20 bg-canvas">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-24 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Panel"
          title="Size düşen konuyu burada görürsünüz."
          description="İade, sipariş veya cevap bekleyen bir konu olduğunda neye bakmanız gerektiği konuşma bağlamıyla birlikte görünür."
        />

        <MarketingReveal className="mt-10">
          <SellerWorkbenchProof />
        </MarketingReveal>
      </div>
    </section>
  );
}

function SellerWorkbenchProof() {
  return (
    <div className="overflow-hidden rounded-sheet border border-boundary/70 bg-chrome shadow-surface">
      <div className="border-b border-divider bg-chrome px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="type-meta font-semibold text-chrome-foreground/62">Satıcı paneli</p>
            <h3 className="mt-1.5 font-heading text-2xl font-semibold tracking-[-0.02em] text-chrome-foreground sm:text-[28px]">
              Bugün ilgilenmeniz gerekenler
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <WorkloadLabel label="Önce bakılacaklar" active />
            <WorkloadLabel label="Vakit varsa" />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="border-b border-divider bg-sunken lg:border-b-0 lg:border-r">
          <div className="border-b border-divider px-5 py-4 sm:px-6">
            <p className="type-eyebrow text-muted-foreground">Önce bunlar</p>
          </div>

          <article className="group relative bg-raised transition-colors duration-200 hover:bg-elevated/50">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-5 sm:p-6">
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
                  <p className="type-body text-muted">{MARKETING_STORY.returnQuestion}</p>
                  <p className="type-row-secondary text-muted-foreground">{MARKETING_STORY.storeLabel}</p>
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
        </div>

        <aside className="bg-raised p-5 sm:p-6">
          <p className="type-meta font-semibold text-muted-foreground">Bağlam</p>
          <dl className="mt-4 divide-y divide-divider border-y border-divider">
            <ContextRow label="Konuşma" value={MARKETING_STORY.storeLabel} />
            <ContextRow label="Durum" value="İade incelemesi" attention />
            <ContextRow label="Kontrol" value="Otomatik yanıt durdu" />
          </dl>
          <p className="mt-5 type-row-secondary text-muted">
            Ne olduğunu anlamak için konuşmadan kopmadan ilgili kayda geçersiniz.
          </p>
        </aside>
      </div>
    </div>
  );
}

function WorkloadLabel({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div className="relative pb-1">
      <p className={active ? "type-meta font-semibold text-chrome-foreground" : "type-meta text-chrome-foreground/48"}>
        {label}
      </p>
      {active ? <span aria-hidden="true" className="absolute inset-x-0 -bottom-0.5 h-px bg-primary" /> : null}
    </div>
  );
}

function ContextRow({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: string;
  attention?: boolean;
}) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-3 py-3">
      <dt className="type-meta text-muted-foreground">{label}</dt>
      <dd className={attention ? "type-row-secondary font-semibold text-attention" : "type-row-secondary text-foreground"}>
        {value}
      </dd>
    </div>
  );
}
