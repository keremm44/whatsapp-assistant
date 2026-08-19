import * as React from "react";

import { MARKETING_STORY } from "@/components/marketing/marketing-story";
import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";
import { StatusChip } from "@/components/shared/status-chip";

/**
 * Panel — the event shown in Difficult Cases now appears in the seller's
 * operational view. No fabricated metrics: the proof is relationship and
 * priority, not analytics.
 */
export function PanelSection() {
  return (
    <section id="panel" className="scroll-mt-20 bg-canvas">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-24 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Görünürlük"
          title="Az önce duran konuşma burada kaybolmaz."
          description="Aynı iade kaydı, satıcı panelinde önceliği ve konuşma bağlamıyla görünür. Ne olduğunu anlamak için farklı ekranlarda iz sürmezsiniz."
        />

        <MarketingReveal className="mt-12">
          <SellerPanelProof />
        </MarketingReveal>
      </div>
    </section>
  );
}

function SellerPanelProof() {
  return (
    <div className="overflow-hidden rounded-sheet border border-boundary/70 bg-chrome shadow-surface">
      <div className="grid min-h-[430px] lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-divider bg-chrome px-4 py-5 lg:border-b-0 lg:border-r">
          <p className="type-meta font-semibold text-chrome-foreground">Satıcı paneli</p>
          <p className="mt-1 type-meta text-chrome-foreground/55">
            Gerçek operasyon dilinden türetilmiş örnek
          </p>

          <div className="mt-6 space-y-2">
            <PanelNavItem label="Önce bunlar" active />
            <PanelNavItem label="Bugün bakılabilecekler" />
            <PanelNavItem label="Konuşmalar" />
          </div>
        </aside>

        <div className="bg-sunken p-4 sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="type-eyebrow text-muted-foreground">Önce bunlar</p>
              <h3 className="mt-1 font-heading text-2xl font-semibold tracking-[-0.02em] text-foreground">
                Satıcı müdahalesi isteyen kayıtlar
              </h3>
            </div>
            <span className="type-meta text-muted-foreground">
              Öncelik backend durumundan gelir
            </span>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-hidden rounded-sheet border border-boundary/60 bg-raised">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider px-4 py-3">
                <div>
                  <p className="type-row-primary text-foreground">İade incelemesi</p>
                  <p className="mt-0.5 type-row-secondary text-muted">
                    {MARKETING_STORY.returnQuestion}
                  </p>
                </div>
                <StatusChip tone="attention">İncelemeniz gerekiyor</StatusChip>
              </div>

              <div className="px-4 py-4">
                <p className="type-meta font-semibold text-muted-foreground">Sistem durumu</p>
                <p className="mt-1 type-body text-foreground">
                  {MARKETING_STORY.returnSystemOutcome}
                </p>
              </div>
            </div>

            <div className="rounded-sheet border border-boundary/60 bg-raised p-4">
              <p className="type-meta font-semibold text-muted-foreground">Konuşma bağlamı</p>
              <p className="mt-3 type-row-primary text-foreground">
                {MARKETING_STORY.storeLabel}
              </p>
              <p className="mt-1 type-row-secondary text-muted">
                Aynı konuşmadan iade kaydına geçiş; olay bağlamı korunur.
              </p>
              <a
                href="#dene"
                className="mt-5 inline-flex rounded-control border border-boundary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/45 hover:bg-hover/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Konuşmayı görün
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelNavItem({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div
      className={
        active
          ? "border-l-2 border-primary bg-chrome-hover px-3 py-2.5 text-sm font-medium text-chrome-foreground"
          : "border-l-2 border-transparent px-3 py-2.5 text-sm text-chrome-foreground/65"
      }
    >
      {label}
    </div>
  );
}
