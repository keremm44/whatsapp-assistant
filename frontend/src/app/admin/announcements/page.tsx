import type { Route } from "next";
import Link from "next/link";

import { AnnouncementForm } from "@/components/admin/announcement-form";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import {
  resolveAdminAnnouncementDetail,
  resolveAdminAnnouncements,
} from "@/lib/admin/announcements-server";
import { resolveAdminSellersFromSession } from "@/lib/admin/sellers-server";

const PAGE_SIZE = 30;
const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

function announcementHref(input: { announcement?: number; page?: number }) {
  const params = new URLSearchParams();
  if (input.announcement) params.set("announcement", String(input.announcement));
  if (input.page && input.page > 1) params.set("page", String(input.page));
  return `/admin/announcements${params.size ? `?${params}` : ""}` as Route;
}

export default async function AdminAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const selectedId = Number(one(params.announcement));
  const rawPage = Number(one(params.page));
  const pageNumber = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const offset = (pageNumber - 1) * PAGE_SIZE;

  const [list, sellerDirectory] = await Promise.all([
    resolveAdminAnnouncements({ limit: PAGE_SIZE, offset }),
    resolveAdminSellersFromSession({ limit: 100, offset: 0 }),
  ]);
  const detail =
    Number.isInteger(selectedId) && selectedId > 0
      ? await resolveAdminAnnouncementDetail(selectedId)
      : null;

  const sellers = sellerDirectory.state === "ready" ? sellerDirectory.page.sellers : [];
  const total = list.state === "ready" ? list.page.total : 0;
  const hasPrevious = pageNumber > 1;
  const hasNext = list.state === "ready" && offset + list.page.announcements.length < total;

  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <PageHeader
        caption="YÖNETİM"
        title="Duyurular"
        description="Seller’lara uygulama içi duyurular yayınlayın ve okunma durumunu hedef bazında takip edin."
      />

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,.95fr)] xl:items-start">
        <AnnouncementForm sellers={sellers} />

        <section className="overflow-hidden rounded-sheet border border-boundary/70 bg-raised shadow-surface">
          <div className="flex items-start justify-between gap-4 border-b border-divider px-5 py-4 sm:px-6">
            <div>
              <p className="type-meta font-semibold text-primary">YAYIN GEÇMİŞİ</p>
              <h2 className="mt-1 type-section text-foreground">Duyuru kayıtları</h2>
            </div>
            {list.state === "ready" ? (
              <span className="type-figure text-sm font-semibold text-muted-foreground">{total}</span>
            ) : null}
          </div>

          {list.state === "ready" ? (
            list.page.announcements.length ? (
              <>
                <ul className="divide-y divide-divider" aria-label="Duyuru geçmişi">
                  {list.page.announcements.map((announcement) => {
                    const ratio = announcement.targetCount
                      ? Math.round((announcement.readCount / announcement.targetCount) * 100)
                      : 0;
                    return (
                      <li key={announcement.id}>
                        <Link
                          href={announcementHref({ announcement: announcement.id, page: pageNumber })}
                          className={`block px-5 py-4 transition-colors hover:bg-elevated ${selectedId === announcement.id ? "bg-selected/55" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="truncate type-row-primary text-foreground">{announcement.title}</p>
                              <p className="mt-1 line-clamp-2 type-row-secondary text-muted">{announcement.message}</p>
                              <p className="mt-2 type-meta text-muted-foreground">
                                {formatDateTime(announcement.publishedAt)} · {announcement.audienceType === "ALL_SELLERS" ? "Tüm aktif seller’lar" : "Seçili seller’lar"}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="type-figure text-lg font-semibold text-foreground">%{ratio}</p>
                              <p className="mt-1 type-meta text-muted-foreground">
                                {announcement.readCount}/{announcement.targetCount} okundu
                              </p>
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {(hasPrevious || hasNext) ? (
                  <nav className="flex items-center justify-between gap-3 border-t border-divider px-5 py-3" aria-label="Duyuru sayfaları">
                    {hasPrevious ? (
                      <Link href={announcementHref({ page: pageNumber - 1 })} className="type-row-secondary font-semibold text-primary">Önceki</Link>
                    ) : <span />}
                    <span className="type-meta text-muted-foreground">Sayfa {pageNumber}</span>
                    {hasNext ? (
                      <Link href={announcementHref({ page: pageNumber + 1 })} className="type-row-secondary font-semibold text-primary">Sonraki</Link>
                    ) : <span />}
                  </nav>
                ) : null}
              </>
            ) : (
              <p className="p-6 type-body text-muted">Henüz duyuru yok.</p>
            )
          ) : (
            <p className="p-6 type-body text-muted">Duyurular şu anda yüklenemedi.</p>
          )}
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-sheet border border-boundary/70 bg-raised shadow-surface">
        <div className="border-b border-divider px-5 py-4 sm:px-6">
          <p className="type-meta font-semibold text-primary">YAYIN DETAYI</p>
          <h2 className="mt-1 type-section text-foreground">Hedef ve okunma görünürlüğü</h2>
        </div>
        <div className="p-5 sm:p-6">
          {detail?.state === "ready" ? (
            <AnnouncementDetail announcement={detail.announcement} />
          ) : detail?.state === "not_found" ? (
            <p className="type-body text-muted">Bu duyuru artık görüntülenemiyor.</p>
          ) : detail ? (
            <p className="type-body text-muted">Duyuru detayı şu anda yüklenemedi.</p>
          ) : (
            <p className="type-body text-muted">Hedef ve okunma ayrıntısını görmek için yayın geçmişinden bir duyuru seçin.</p>
          )}
        </div>
      </section>
    </PageContainer>
  );
}

function AnnouncementDetail({
  announcement,
}: {
  announcement: import("@/lib/admin/announcements-api").AdminAnnouncement;
}) {
  const ratio = announcement.targetCount
    ? Math.round((announcement.readCount / announcement.targetCount) * 100)
    : 0;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-divider pb-5">
        <div className="max-w-3xl">
          <h3 className="type-section text-foreground">{announcement.title}</h3>
          <p className="mt-3 whitespace-pre-wrap type-body text-muted">{announcement.message}</p>
          <p className="mt-3 type-meta text-muted-foreground">{formatDateTime(announcement.publishedAt)}</p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-divider overflow-hidden rounded-sheet border border-boundary/60 bg-sunken">
          <Metric label="Hedef" value={announcement.targetCount} />
          <Metric label="Okundu" value={announcement.readCount} />
          <Metric label="Oran" value={`%${ratio}`} />
        </div>
      </div>

      {announcement.targets ? (
        announcement.targets.length ? (
          <ul className="divide-y divide-divider overflow-hidden rounded-sheet border border-boundary/60" aria-label="Duyuru hedefleri">
            {announcement.targets.map((target) => (
              <li key={target.seller.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate type-row-primary text-foreground">
                    {target.seller.storeName ?? target.seller.name ?? `Seller #${target.seller.id}`}
                  </p>
                  {target.seller.name ? <p className="mt-0.5 truncate type-row-secondary text-muted">{target.seller.name}</p> : null}
                </div>
                <StatusChip tone={target.readAt ? "success" : "muted"}>
                  {target.readAt ? `Okundu · ${formatDateTime(target.readAt)}` : "Okunmadı"}
                </StatusChip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-row-secondary text-muted">Bu yayında hedef seller oluşmadı.</p>
        )
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="type-figure font-display text-xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 type-meta text-muted-foreground">{label}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
