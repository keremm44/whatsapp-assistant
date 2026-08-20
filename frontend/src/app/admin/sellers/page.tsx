import type { Route } from "next";
import Link from "next/link";

import { SellerActivation } from "@/components/admin/seller-activation";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import {
  ADMIN_SELLER_STATUS_PRESENTATION,
  ADMIN_SELLER_SYSTEM_STATUSES,
  type AdminSellerSystemStatus,
} from "@/lib/admin/seller-format";
import {
  resolveAdminSellerFromSession,
  resolveAdminSellersFromSession,
} from "@/lib/admin/sellers-server";

const PAGE_SIZE = 30;
const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

function directoryHref(input: {
  q?: string;
  status?: AdminSellerSystemStatus;
  seller?: number;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.status) params.set("status", input.status);
  if (input.seller) params.set("seller", String(input.seller));
  if (input.page && input.page > 1) params.set("page", String(input.page));
  return `/admin/sellers${params.size ? `?${params}` : ""}` as Route;
}

export default async function AdminSellersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawStatus = one(params.status);
  const status = ADMIN_SELLER_SYSTEM_STATUSES.includes(rawStatus as AdminSellerSystemStatus)
    ? (rawStatus as AdminSellerSystemStatus)
    : undefined;
  const q = one(params.q)?.trim() || undefined;
  const selectedId = Number(one(params.seller));
  const requestedPage = Number(one(params.page));
  const pageNumber = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (pageNumber - 1) * PAGE_SIZE;

  const list = await resolveAdminSellersFromSession({
    q,
    status,
    limit: PAGE_SIZE,
    offset,
  });
  const detail =
    Number.isInteger(selectedId) && selectedId > 0
      ? await resolveAdminSellerFromSession(selectedId)
      : null;

  const total = list.state === "ready" ? list.page.total : 0;
  const hasPrevious = pageNumber > 1;
  const hasNext = list.state === "ready" && offset + list.page.sellers.length < total;

  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <PageHeader
        caption="YÖNETİM"
        title="Mağazalar"
        description="Seller’ların kurulum, aktivasyon ve çalışma durumlarını izleyin."
      />

      <div className="mt-8 grid overflow-hidden rounded-sheet border border-boundary/70 bg-raised shadow-surface lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="border-b border-divider lg:border-b-0 lg:border-r">
          <div className="border-b border-divider p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="type-meta font-semibold text-primary">MAĞAZA DİZİNİ</p>
              {list.state === "ready" ? (
                <span className="type-figure text-sm font-semibold text-muted-foreground">{total}</span>
              ) : null}
            </div>
            <form className="mt-3 flex gap-2">
              {status ? <input type="hidden" name="status" value={status} /> : null}
              <input
                name="q"
                defaultValue={q}
                placeholder="Mağaza veya yetkili ara"
                className="min-w-0 flex-1 rounded-control border border-boundary bg-control px-3 py-2 type-row-secondary text-foreground"
              />
              <button className="rounded-control bg-primary px-3 type-row-secondary font-semibold text-primary-foreground">
                Ara
              </button>
            </form>
            <nav className="mt-3 flex flex-wrap gap-2" aria-label="Mağaza durumu">
              {[undefined, ...ADMIN_SELLER_SYSTEM_STATUSES].map((item) => (
                <Link
                  key={item ?? "all"}
                  href={directoryHref({ q, status: item })}
                  className={`rounded-pill px-2 py-1 type-meta ${status === item ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-elevated"}`}
                >
                  {item ? ADMIN_SELLER_STATUS_PRESENTATION[item].label : "Tümü"}
                </Link>
              ))}
            </nav>
          </div>

          {list.state === "ready" ? (
            list.page.sellers.length ? (
              <>
                <ul className="divide-y divide-divider" aria-label="Mağazalar">
                  {list.page.sellers.map((seller) => {
                    const presentation = ADMIN_SELLER_STATUS_PRESENTATION[seller.systemStatus];
                    return (
                      <li key={seller.id}>
                        <Link
                          href={directoryHref({ q, status, seller: seller.id, page: pageNumber })}
                          className={`block px-4 py-4 transition-colors hover:bg-elevated ${selectedId === seller.id ? "bg-selected/55" : ""}`}
                        >
                          <div className="flex justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate type-row-primary text-foreground">{seller.storeName}</p>
                              <p className="mt-0.5 truncate type-row-secondary text-muted">{seller.name}</p>
                            </div>
                            <StatusChip tone={presentation.tone}>{presentation.label}</StatusChip>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {(hasPrevious || hasNext) ? (
                  <nav
                    className="flex items-center justify-between gap-3 border-t border-divider px-4 py-3"
                    aria-label="Mağaza sayfaları"
                  >
                    {hasPrevious ? (
                      <Link
                        href={directoryHref({ q, status, page: pageNumber - 1 })}
                        className="type-row-secondary font-semibold text-primary"
                      >
                        Önceki
                      </Link>
                    ) : <span />}
                    <span className="type-meta text-muted-foreground">Sayfa {pageNumber}</span>
                    {hasNext ? (
                      <Link
                        href={directoryHref({ q, status, page: pageNumber + 1 })}
                        className="type-row-secondary font-semibold text-primary"
                      >
                        Sonraki
                      </Link>
                    ) : <span />}
                  </nav>
                ) : null}
              </>
            ) : (
              <p className="p-5 type-row-secondary text-muted">Bu filtrede mağaza bulunamadı.</p>
            )
          ) : (
            <p className="p-5 type-row-secondary text-muted">Mağaza listesi şu anda yüklenemedi.</p>
          )}
        </aside>

        <section className="min-h-[500px] p-5 sm:p-6 lg:p-7">
          {detail?.state === "ready" ? (
            <SellerDetail seller={detail.seller} />
          ) : detail?.state === "not_found" ? (
            <p className="type-body text-muted">Bu mağaza artık görüntülenemiyor.</p>
          ) : detail ? (
            <p className="type-body text-muted">Mağaza detayı şu anda yüklenemedi.</p>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center text-center">
              <div className="max-w-sm">
                <p className="type-record-identity text-foreground">Mağaza bağlamı</p>
                <p className="mt-2 type-body text-muted">
                  Kurulum ve çalışma durumunu görmek için soldaki dizinden bir mağaza seçin.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

function SellerDetail({ seller }: { seller: import("@/lib/admin/sellers-api").AdminSeller }) {
  const presentation = ADMIN_SELLER_STATUS_PRESENTATION[seller.systemStatus];
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-divider pb-5">
        <div>
          <p className="type-meta font-semibold text-primary">MAĞAZA DETAYI</p>
          <h2 className="mt-2 type-section text-foreground">{seller.storeName}</h2>
          <p className="mt-1 type-row-secondary text-muted">{seller.name}</p>
        </div>
        <StatusChip tone={presentation.tone}>{presentation.label}</StatusChip>
      </div>
      <dl className="grid gap-5 sm:grid-cols-2">
        <Item label="Kurulum" value={seller.onboardingCompleted ? "Tamamlandı" : seller.onboardingStatus ?? "Devam ediyor"} />
        <Item label="AI durumu" value={seller.aiEnabled ? "Aktif" : "Aktif değil"} />
        <Item label="Oluşturulma" value={formatDate(seller.createdAt)} />
        <Item label="Son güncelleme" value={formatDate(seller.updatedAt)} />
      </dl>
      <div className="flex flex-wrap items-center gap-4 border-t border-divider pt-5">
        {seller.storeLink ? (
          <a
            href={seller.storeLink}
            target="_blank"
            rel="noreferrer"
            className="type-row-secondary font-semibold text-primary hover:underline"
          >
            Mağaza bağlantısını aç
          </a>
        ) : null}
        <SellerActivation seller={seller} />
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="type-meta text-muted-foreground">{label}</dt>
      <dd className="mt-1 type-row-primary text-foreground">{value}</dd>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(value));
}
