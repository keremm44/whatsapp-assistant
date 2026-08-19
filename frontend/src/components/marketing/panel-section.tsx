import * as React from "react";

import { MarketingReveal } from "@/components/marketing/marketing-motion";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";
import { StatusChip } from "@/components/shared/status-chip";

/**
 * Panel — the section that answers "çalışırken ne göreceğim ve benden ne
 * isteyecek?" It renders an Instrument-language rendition of the real
 * dashboard mental model (priority split + task types), derived from the
 * seller panel's task presentation — never a fabricated analytics
 * dashboard. Coral appears only where the backend genuinely means
 * seller review.
 */
export function PanelSection() {
  return (
    <section id="panel" className="scroll-mt-20 border-y border-divider bg-sunken">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-20 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Görünürlük"
          title="Günün sonunda ne olduğunu görürsünüz."
          description="Panel size ham veri yığını bırakmaz; bakılması gerekeni öncelik sırasıyla sunar. Bütün gün başında beklemeniz gerekmez."
        />

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-10">
          <MarketingReveal>
            <DashboardProof />
          </MarketingReveal>
          <div className="flex flex-col justify-center gap-4">
            <PanelRow
              title="Önce bunlar"
              body="İade ve sipariş incelemeleri “Önce bunlar”da toplanır. Sizden bir şey istendiğinde “İncelemeniz gerekiyor” işareti görürsünüz."
            />
            <PanelRow
              title="Bugün bakılabilecekler"
              body="Yanıt bekleyen sorular daha sakin bir listede durur. Siz doğru cevabı kaydedersiniz; aynı soru tekrar geldiğinde asistan bu kayıtlı cevabı kullanabilir."
            />
            <PanelRow
              title="Kayıtlar birbirine bağlı"
              body="Bir konuşmadan siparişe, iadeye veya cevaplanamayan soruya tek tıkla geçersiniz. Olayın tamamı bir arada durur."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function DashboardProof() {
  return (
    <div className="overflow-hidden rounded-sheet border border-boundary/60 bg-raised shadow-surface transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/35">
      <div className="flex items-center justify-between gap-3 border-b border-divider bg-chrome/45 px-4 py-2.5">
        <p className="type-meta font-semibold text-muted-foreground">
          Genel bakış — örnek iş listesi
        </p>
        <span className="inline-flex items-center gap-1.5 type-meta font-semibold text-primary">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
          Canlı çalışma yüzeyi
        </span>
      </div>
      <div className="divide-y divide-divider">
        <TaskRow
          title="İade incelemesi"
          summary="Müşteri 42 numara yerine 40 geldiğini belirtiyor."
          attention
        />
        <TaskRow
          title="Sipariş incelemesi"
          summary="Tasarım dosyasının çözünürlüğü baskı için yetersiz."
          attention
        />
        <TaskRow
          title="Yanıt bekleyen soru"
          summary="“Kargo ücreti ne kadar?” — kayıtlı cevap henüz yok."
        />
      </div>
      <div className="grid grid-cols-3 border-t border-divider bg-recessed/70">
        <ProofStat label="Öncelik" value="İnceleme" />
        <ProofStat label="Bağlam" value="Konuşma" />
        <ProofStat label="Aksiyon" value="Satıcı" />
      </div>
    </div>
  );
}

function ProofStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-divider px-3 py-2.5 last:border-r-0">
      <p className="type-meta text-muted-foreground">{label}</p>
      <p className="mt-0.5 type-row-primary text-foreground">{value}</p>
    </div>
  );
}

function TaskRow({
  title,
  summary,
  attention = false,
}: {
  title: string;
  summary: string;
  attention?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3.5 transition-colors duration-150 hover:bg-hover/35">
      <div className="min-w-0">
        <p className="type-row-primary text-foreground">{title}</p>
        <p className="mt-0.5 truncate type-row-secondary text-muted">
          {summary}
        </p>
      </div>
      {attention ? (
        <StatusChip tone="attention" className="shrink-0">
          İncelemeniz gerekiyor
        </StatusChip>
      ) : (
        <span className="shrink-0 type-row-secondary text-muted-foreground">
          Bugün bakılabilir
        </span>
      )}
    </div>
  );
}

function PanelRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-l-2 border-boundary pl-4 sm:pl-5">
      <h3 className="font-heading text-[17px] font-semibold leading-6 text-foreground">
        {title}
      </h3>
      <p className="mt-1 type-body text-muted">{body}</p>
    </div>
  );
}
