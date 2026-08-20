import type { Route } from "next";
import Link from "next/link";
import { Bell, CircleAlert, ClipboardCheck, MessageSquareText } from "lucide-react";

import { StatusChip } from "@/components/shared/status-chip";
import type {
  AdminOverviewSnapshot,
  AdminOverviewSource,
} from "@/lib/admin/overview";

export function AdminOverview({ snapshot }: { snapshot: AdminOverviewSnapshot }) {
  const pending = totalOf(snapshot.pendingApplications);
  const activation = totalOf(snapshot.activationReviews);
  const feedback = totalOf(snapshot.openFeedback);
  const allReady = pending !== null && activation !== null && feedback !== null;
  const total = allReady ? pending + activation + feedback : null;

  return (
    <div className="space-y-8 lg:space-y-10">
      <div className="flex flex-col gap-5 pb-1 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
        <div className="space-y-2.5">
          <h1 className="type-page-title text-foreground">Bugün yönetmeniz gerekenler</h1>
          <p className="max-w-2xl type-body text-muted">
            Başvuru, aktivasyon ve seller geri bildirimleri gerçek operasyon kuyruklarından burada özetlenir.
          </p>
        </div>
        {allReady ? (
          <dl
            role="status"
            aria-label={`Yönetim dikkatinde toplam ${total} konu`}
            className="grid w-full shrink-0 grid-cols-4 divide-x divide-divider self-start overflow-hidden rounded-sheet border border-boundary/60 bg-raised shadow-surface sm:w-auto sm:min-w-[470px]"
          >
            <WorkloadStat label="Başvurular" value={pending} />
            <WorkloadStat label="Aktivasyon" value={activation} />
            <WorkloadStat label="Geri bildirim" value={feedback} />
            <WorkloadStat label="Toplam" value={total} />
          </dl>
        ) : null}
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className="type-section text-foreground">Önce bunlar</h2>
                {total !== null ? <span className="type-figure type-meta text-muted-foreground">{total}</span> : null}
              </div>
              <p className="mt-1 type-row-secondary text-muted">Yönetim kararı veya incelemesi bekleyen işler.</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-sheet border border-boundary/70 bg-raised shadow-surface">
            <PriorityRow
              href="/admin/applications?status=pending"
              label="Yeni başvurular"
              source={snapshot.pendingApplications}
              readyCopy="Yeni mağaza adaylarını inceleyin ve uygunsa davet sürecini başlatın."
              emptyCopy="Şu anda yeni başvuru yok."
              icon={ClipboardCheck}
              tone="primary"
            />
            <PriorityRow
              href="/admin/sellers?status=admin_review_pending"
              label="Aktivasyon bekleyen mağazalar"
              source={snapshot.activationReviews}
              readyCopy="Kurulumu tamamlanan mağazaların aktivasyon kararını verin."
              emptyCopy="Şu anda aktivasyon onayı bekleyen mağaza yok."
              icon={CircleAlert}
              tone="attention"
            />
            <PriorityRow
              href="/admin/feedback?status=OPEN"
              label="Açık geri bildirimler"
              source={snapshot.openFeedback}
              readyCopy="Seller’lardan gelen açık geri bildirimleri gözden geçirin."
              emptyCopy="Şu anda açık geri bildirim yok."
              icon={MessageSquareText}
              tone="primary"
            />
          </div>
        </div>

        <AnnouncementSummary source={snapshot.latestAnnouncement} />
      </section>
    </div>
  );
}

function WorkloadStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3 sm:px-5">
      <dd className="type-figure font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground">
        {value}
      </dd>
      <dt className="mt-1.5 type-meta text-muted-foreground">{label}</dt>
    </div>
  );
}

function PriorityRow({
  href,
  label,
  source,
  readyCopy,
  emptyCopy,
  icon: Icon,
  tone,
}: {
  href: Route;
  label: string;
  source: AdminOverviewSource<{ total: number }>;
  readyCopy: string;
  emptyCopy: string;
  icon: typeof ClipboardCheck;
  tone: "primary" | "attention";
}) {
  const ready = source.state === "ready";
  const count = ready ? source.data.total : null;
  const isEmpty = count === 0;
  const iconClass = tone === "attention" ? "border-attention/30 text-attention" : "border-primary/30 text-primary";

  return (
    <Link
      href={href}
      className="group grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4 border-b border-divider px-5 py-4 transition-colors last:border-b-0 hover:bg-elevated sm:px-6"
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-control border bg-sunken ${iconClass}`}>
        <Icon aria-hidden="true" size={18} strokeWidth={1.7} />
      </span>
      <div className="min-w-0">
        <p className="type-row-primary text-foreground">{label}</p>
        <p className="mt-0.5 type-row-secondary text-muted">
          {!ready ? "Bu kuyruk şu anda yüklenemedi." : isEmpty ? emptyCopy : readyCopy}
        </p>
      </div>
      <span className="type-figure text-[22px] font-semibold leading-none text-foreground">
        {ready ? count : "—"}
      </span>
    </Link>
  );
}

function AnnouncementSummary({
  source,
}: {
  source: AdminOverviewSource<{
    total: number;
    latest: { title: string; targetCount: number; readCount: number } | null;
  }>;
}) {
  const ready = source.state === "ready";
  const latest = ready ? source.data.latest : null;
  return (
    <section className="overflow-hidden rounded-sheet border border-boundary/70 bg-sunken shadow-surface">
      <div className="flex items-center justify-between gap-3 border-b border-divider px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-control border border-brand/30 bg-brand/10 text-brand">
            <Bell aria-hidden="true" size={18} strokeWidth={1.7} />
          </span>
          <div>
            <p className="type-meta font-semibold text-brand">DUYURULAR</p>
            <h2 className="mt-0.5 type-row-primary text-foreground">Son yayın</h2>
          </div>
        </div>
        {ready ? <StatusChip tone="muted">{source.data.total}</StatusChip> : null}
      </div>
      <div className="p-5">
        {latest ? (
          <>
            <p className="type-row-primary text-foreground">{latest.title}</p>
            <p className="mt-2 type-row-secondary text-muted">
              {latest.readCount}/{latest.targetCount} seller okudu.
            </p>
          </>
        ) : (
          <>
            <p className="type-row-primary text-foreground">{ready ? "Henüz duyuru yok" : "Duyuru özeti yüklenemedi"}</p>
            <p className="mt-2 type-row-secondary text-muted">
              {ready ? "Yeni yayınlar burada özetlenecek." : "Bağlantı sağlandığında güncel durum görünecek."}
            </p>
          </>
        )}
        <Link href="/admin/announcements" className="mt-5 inline-flex type-row-secondary font-semibold text-primary hover:underline">
          Duyurulara git
        </Link>
      </div>
    </section>
  );
}

function totalOf(source: AdminOverviewSource<{ total: number }>) {
  return source.state === "ready" ? source.data.total : null;
}
