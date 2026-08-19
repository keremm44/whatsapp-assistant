import * as React from "react";

import { StatusChip } from "@/components/shared/status-chip";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

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
    <section className="border-y border-divider bg-sunken">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-16 md:px-6 md:py-20 lg:px-8">
        <MarketingSectionHeading
          eyebrow="Görünürlük"
          title="Günün sonunda ne olduğunu görürsünüz."
          description="Panel size ham veri yığını bırakmaz; bakılması gerekeni öncelik sırasıyla sunar. Bütün gün başında beklemeniz gerekmez."
        />

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
          <DashboardProof />
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

/** A single dashboard task ledger, mirroring the real task presentation. */
function DashboardProof() {
  return (
    <div className="overflow-hidden rounded-sheet border border-boundary/60 bg-raised shadow-surface">
      <p className="border-b border-divider px-4 py-2.5 type-meta font-semibold text-muted-foreground">
        Genel bakış — örnek iş listesi
      </p>
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
    <div className="flex items-start justify-between gap-4 px-4 py-3.5">
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
