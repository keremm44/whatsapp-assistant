import {
  Bell,
  CircleAlert,
  ClipboardCheck,
  MessageSquareText,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";

import { StatusChip } from "@/components/shared/status-chip";
import type {
  AdminOverviewSnapshot,
  AdminOverviewSource,
} from "@/lib/admin/overview";
import type { AdminLatestAnnouncementItem } from "@/lib/admin/overview-format";

export function AdminOverview({ snapshot }: { snapshot: AdminOverviewSnapshot }) {
  return (
    <div className="space-y-8 lg:space-y-10">
      {snapshot.latestAnnouncement.state === "ready" && snapshot.latestAnnouncement.data.latest?.importance === "IMPORTANT" ? (
        <ImportantAnnouncementBanner announcement={snapshot.latestAnnouncement.data.latest} />
      ) : null}
      <section aria-label="Yönetim öncelikleri" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewMeasure
          label="Yeni başvurular"
          description="İncelemenizi bekleyen aday mağazalar"
          source={snapshot.pendingApplications}
          icon={ClipboardCheck}
          tone="primary"
        />
        <OverviewMeasure
          label="Aktivasyon bekleyenler"
          description="Kurulumu tamamlayıp yönetim onayı bekleyen mağazalar"
          source={snapshot.activationReviews}
          icon={CircleAlert}
          tone="attention"
        />
        <OverviewMeasure
          label="Açık geri bildirimler"
          description="Seller’lardan gelen çözülmemiş geri bildirimler"
          source={snapshot.openFeedback}
          icon={MessageSquareText}
          tone="primary"
        />
        <AnnouncementMeasure source={snapshot.latestAnnouncement} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="overflow-hidden rounded-sheet border border-boundary/70 bg-raised shadow-surface">
          <div className="flex items-start justify-between gap-5 border-b border-divider px-5 py-4 sm:px-6">
            <div>
              <p className="type-meta font-semibold text-primary">ÖNCE BUNLAR</p>
              <h2 className="mt-1 type-section text-foreground">Yönetim dikkat alanı</h2>
              <p className="mt-1 type-row-secondary text-muted">
                Başvuru, aktivasyon ve geri bildirim kuyrukları backend’den ayrı ayrı okunur.
              </p>
            </div>
          </div>
          <div className="divide-y divide-divider">
            <PriorityRow
              label="Başvurular"
              source={snapshot.pendingApplications}
              readyCopy="Yeni başvuru incelemenizi bekliyor."
              emptyCopy="Şu anda yeni başvuru yok."
              tone="primary"
            />
            <PriorityRow
              label="Aktivasyonlar"
              source={snapshot.activationReviews}
              readyCopy="Mağaza kurulumu sonrası yönetim onayı bekliyor."
              emptyCopy="Şu anda aktivasyon onayı bekleyen mağaza yok."
              tone="attention"
            />
            <PriorityRow
              label="Geri bildirimler"
              source={snapshot.openFeedback}
              readyCopy="Açık seller geri bildirimi gözden geçirilmeli."
              emptyCopy="Şu anda açık geri bildirim yok."
              tone="primary"
            />
          </div>
        </div>

        <section className="rounded-sheet border border-boundary/70 bg-sunken p-5 shadow-surface sm:p-6">
          <p className="type-meta font-semibold text-brand">SİSTEM NOTU</p>
          <h2 className="mt-2 type-record-identity text-foreground">Operasyon görünürlüğü</h2>
          <p className="mt-3 type-body text-muted">
            Bu alan, yönetim işlerini tek bir yapay puanda toplamak yerine her iş akışını kendi gerçek durumu ve kaynağıyla gösterir.
          </p>
          <div className="mt-5 border-t border-divider pt-4">
            <p className="type-row-secondary text-muted-foreground">
              Ayrıntılı inceleme alanları başvurular, mağazalar, geri bildirimler ve duyurular olarak ayrı çalışma yüzeylerinde açılacak.
            </p>
          </div>
        </section>
      </section>
    </div>
  );
}

function OverviewMeasure({
  label,
  description,
  source,
  icon: Icon,
  tone,
}: {
  label: string;
  description: string;
  source: AdminOverviewSource<{ total: number }>;
  icon: typeof ClipboardCheck;
  tone: "primary" | "attention";
}) {
  const ready = source.state === "ready";
  const color = tone === "attention" ? "text-attention" : "text-primary";
  const border = tone === "attention" ? "border-attention/30" : "border-primary/30";

  return (
    <article className="min-h-[174px] rounded-sheet border border-boundary/70 bg-raised p-5 shadow-surface">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-control border ${border} bg-sunken ${color}`}>
          <Icon aria-hidden="true" size={18} strokeWidth={1.7} />
        </span>
        {ready ? <StatusChip tone="muted">Canlı veri</StatusChip> : null}
      </div>
      <p className="mt-6 type-figure font-display text-[32px] font-semibold leading-none text-foreground">
        {ready ? source.data.total : "—"}
      </p>
      <h2 className="mt-2 type-row-primary text-foreground">{label}</h2>
      <p className="mt-1.5 type-row-secondary text-muted">{ready ? description : "Bu özet şu anda yüklenemedi."}</p>
    </article>
  );
}

function ImportantAnnouncementBanner({
  announcement,
}: {
    announcement: AdminLatestAnnouncementItem;
}) {
  return (
    <section className="overflow-hidden rounded-sheet border border-attention/30 bg-attention/10 shadow-surface" aria-label="Önemli duyuru">
      <div className="grid items-stretch lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="p-5 sm:p-6">
          <p className="type-meta font-semibold tracking-[0.08em] text-attention">ÖNEMLİ DUYURU</p>
          <h2 className="mt-2 type-section text-foreground">{announcement.title}</h2>
          <p className="mt-2 line-clamp-3 max-w-2xl whitespace-pre-wrap type-body text-muted">{announcement.message}</p>
          <Link href="/admin/announcements" className="mt-4 inline-flex items-center gap-1.5 type-row-secondary font-semibold text-primary hover:underline">
            Duyurulara git <ArrowUpRight aria-hidden="true" size={15} />
          </Link>
        </div>
        {announcement.imageUrl ? <div className="aspect-video bg-sunken lg:aspect-auto"><img src={announcement.imageUrl} alt="" className="h-full w-full object-cover" /></div> : null}
      </div>
    </section>
  );
}

function AnnouncementMeasure({
  source,
}: {
  source: AdminOverviewSource<{
    total: number;
    latest: { title: string; message: string; importance: "NORMAL" | "IMPORTANT"; imageUrl: string | null; targetCount: number; readCount: number } | null;
  }>;
}) {
  const ready = source.state === "ready";
  const latest = ready ? source.data.latest : null;

  return (
    <article className="min-h-[174px] rounded-sheet border border-boundary/70 bg-overlay/75 p-5 shadow-surface">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-control border border-brand/30 bg-brand/10 text-brand">
          <Bell aria-hidden="true" size={18} strokeWidth={1.7} />
        </span>
        {ready ? <StatusChip tone="muted">Duyurular</StatusChip> : null}
      </div>
      {latest ? (
        <div className="mt-5">
          <p className="truncate type-row-primary text-foreground" title={latest.title}>{latest.title}</p>
          <p className="mt-1.5 type-row-secondary text-muted">
            {latest.targetCount} seller’a ulaştı · {latest.readCount} okundu
          </p>
        </div>
      ) : (
        <div className="mt-5">
          <p className="type-row-primary text-foreground">{ready ? "Henüz duyuru yok" : "Duyuru özeti yüklenemedi"}</p>
          <p className="mt-1.5 type-row-secondary text-muted">
            {ready ? "Yeni duyurular burada özetlenecek." : "Bağlantı tekrar sağlandığında güncel durum görünecek."}
          </p>
        </div>
      )}
    </article>
  );
}

function PriorityRow({
  label,
  source,
  readyCopy,
  emptyCopy,
  tone,
}: {
  label: string;
  source: AdminOverviewSource<{ total: number }>;
  readyCopy: string;
  emptyCopy: string;
  tone: "primary" | "attention";
}) {
  const ready = source.state === "ready";
  const count = ready ? source.data.total : null;
  const isEmpty = count === 0;

  return (
    <div className="flex items-center gap-4 px-5 py-4 sm:px-6">
      <span className={`h-8 w-1 shrink-0 rounded-full ${tone === "attention" ? "bg-attention" : "bg-primary"}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="type-row-primary text-foreground">{label}</p>
        <p className="mt-0.5 type-row-secondary text-muted">
          {!ready ? "Bu kuyruk şu anda yüklenemedi." : isEmpty ? emptyCopy : readyCopy}
        </p>
      </div>
      {ready ? (
        <span className="type-figure text-[22px] font-semibold leading-none text-foreground">{count}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </div>
  );
}
