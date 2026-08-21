import type { Route } from "next";
import Link from "next/link";

import { FeedbackActions } from "@/components/admin/feedback-actions";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import {
  ADMIN_FEEDBACK_CATEGORY_LABEL,
  ADMIN_FEEDBACK_CATEGORIES,
  ADMIN_FEEDBACK_STATUS,
  ADMIN_FEEDBACK_STATUSES,
  type AdminFeedbackCategory,
  type AdminFeedbackStatus,
} from "@/lib/admin/feedback-format";
import {
  resolveAdminFeedbackDetail,
  resolveAdminFeedbackList,
} from "@/lib/admin/feedback-server";

const PAGE_SIZE = 30;
const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

function feedbackHref(input: {
  status?: AdminFeedbackStatus;
  category?: AdminFeedbackCategory;
  sellerId?: number;
  feedbackId?: number;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  if (input.category) params.set("category", input.category);
  if (input.sellerId) params.set("seller", String(input.sellerId));
  if (input.feedbackId) params.set("feedback", String(input.feedbackId));
  if (input.page && input.page > 1) params.set("page", String(input.page));
  return `/admin/feedback${params.size ? `?${params}` : ""}` as Route;
}

function tabClass(active: boolean) {
  return `border-b-2 px-1 py-2 type-meta transition-colors ${active ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`;
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawStatus = one(params.status);
  const rawCategory = one(params.category);
  const status = ADMIN_FEEDBACK_STATUSES.includes(rawStatus as AdminFeedbackStatus)
    ? (rawStatus as AdminFeedbackStatus)
    : undefined;
  const category = ADMIN_FEEDBACK_CATEGORIES.includes(rawCategory as AdminFeedbackCategory)
    ? (rawCategory as AdminFeedbackCategory)
    : undefined;
  const selectedId = Number(one(params.feedback));
  const rawSellerId = Number(one(params.seller));
  const sellerId = Number.isInteger(rawSellerId) && rawSellerId > 0 ? rawSellerId : undefined;
  const rawPage = Number(one(params.page));
  const pageNumber = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const offset = (pageNumber - 1) * PAGE_SIZE;

  const list = await resolveAdminFeedbackList({
    status,
    category,
    sellerId,
    limit: PAGE_SIZE,
    offset,
  });
  const detail =
    Number.isInteger(selectedId) && selectedId > 0
      ? await resolveAdminFeedbackDetail(selectedId)
      : null;

  const total = list.state === "ready" ? list.page.total : 0;
  const hasPrevious = pageNumber > 1;
  const hasNext = list.state === "ready" && offset + list.page.feedback.length < total;

  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <PageHeader
        caption="YÖNETİM"
        title="Geri Bildirimler"
        description="Seller’lardan gelen öneri, sorun ve şikâyetleri durum ve mağaza bağlamıyla takip edin."
      />

      <div className="mt-8 grid overflow-hidden rounded-sheet border border-boundary/70 bg-raised shadow-surface lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="border-b border-divider lg:border-b-0 lg:border-r">
          <div className="border-b border-divider px-4 pt-4">
            <div className="flex items-center justify-between gap-3 pb-2">
              <p className="type-meta font-semibold text-primary">GERİ BİLDİRİM KUYRUĞU</p>
              {list.state === "ready" ? (
                <span className="type-figure text-sm font-semibold text-muted-foreground">{total}</span>
              ) : null}
            </div>
            <nav className="flex flex-wrap gap-x-4" aria-label="Geri bildirim durumu">
              {[undefined, ...ADMIN_FEEDBACK_STATUSES].map((item) => (
                <Link
                  key={item ?? "all"}
                  href={feedbackHref({ status: item, category, sellerId })}
                  className={tabClass(status === item)}
                >
                  {item ? ADMIN_FEEDBACK_STATUS[item].label : "Tümü"}
                </Link>
              ))}
            </nav>
            <nav className="flex flex-wrap gap-x-4 border-t border-divider/70" aria-label="Geri bildirim türü">
              {[undefined, ...ADMIN_FEEDBACK_CATEGORIES].map((item) => (
                <Link
                  key={item ?? "all"}
                  href={feedbackHref({ status, category: item, sellerId })}
                  className={tabClass(category === item)}
                >
                  {item ? ADMIN_FEEDBACK_CATEGORY_LABEL[item] : "Tüm türler"}
                </Link>
              ))}
            </nav>
            {sellerId ? (
              <div className="flex items-center justify-between gap-3 border-t border-divider py-3">
                <span className="type-meta text-muted-foreground">Mağaza filtresi · #{sellerId}</span>
                <Link
                  href={feedbackHref({ status, category })}
                  className="type-meta font-semibold text-primary hover:underline"
                >
                  Kaldır
                </Link>
              </div>
            ) : null}
          </div>

          {list.state === "ready" ? (
            list.page.feedback.length ? (
              <>
                <ul className="divide-y divide-divider" aria-label="Geri bildirimler">
                  {list.page.feedback.map((feedback) => {
                    const presentation = ADMIN_FEEDBACK_STATUS[feedback.status];
                    return (
                      <li key={feedback.id}>
                        <Link
                          href={feedbackHref({
                            status,
                            category,
                            sellerId,
                            feedbackId: feedback.id,
                            page: pageNumber,
                          })}
                          className={`block px-4 py-4 transition-colors hover:bg-elevated ${selectedId === feedback.id ? "bg-selected/55" : ""}`}
                        >
                          <div className="flex justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate type-row-primary text-foreground">{feedback.subject}</p>
                              <p className="mt-0.5 truncate type-row-secondary text-muted">
                                {feedback.seller.storeName ?? feedback.seller.name ?? "Mağaza"}
                              </p>
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
                    aria-label="Geri bildirim sayfaları"
                  >
                    {hasPrevious ? (
                      <Link
                        href={feedbackHref({ status, category, sellerId, page: pageNumber - 1 })}
                        className="type-row-secondary font-semibold text-primary"
                      >
                        Önceki
                      </Link>
                    ) : <span />}
                    <span className="type-meta text-muted-foreground">Sayfa {pageNumber}</span>
                    {hasNext ? (
                      <Link
                        href={feedbackHref({ status, category, sellerId, page: pageNumber + 1 })}
                        className="type-row-secondary font-semibold text-primary"
                      >
                        Sonraki
                      </Link>
                    ) : <span />}
                  </nav>
                ) : null}
              </>
            ) : (
              <p className="p-5 type-row-secondary text-muted">Bu filtrede geri bildirim yok.</p>
            )
          ) : (
            <p className="p-5 type-row-secondary text-muted">Geri bildirimler yüklenemedi.</p>
          )}
        </aside>

        <section className="min-h-[500px] p-5 sm:p-6 lg:p-7">
          {detail?.state === "ready" ? (
            <FeedbackDetail
              feedback={detail.feedback}
              status={status}
              category={category}
            />
          ) : detail?.state === "not_found" ? (
            <p className="type-body text-muted">Bu geri bildirim artık görüntülenemiyor.</p>
          ) : detail ? (
            <p className="type-body text-muted">Geri bildirim detayı şu anda yüklenemedi.</p>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center text-center">
              <div className="max-w-sm">
                <p className="type-record-identity text-foreground">Geri bildirim bağlamı</p>
                <p className="mt-2 type-body text-muted">
                  Mesajı, durum geçmişini ve yönetim notunu görmek için soldan bir kayıt seçin.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

function FeedbackDetail({
  feedback,
  status,
  category,
}: {
  feedback: import("@/lib/admin/feedback-api").AdminFeedback;
  status?: AdminFeedbackStatus;
  category?: AdminFeedbackCategory;
}) {
  const presentation = ADMIN_FEEDBACK_STATUS[feedback.status];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-divider pb-5">
        <div>
          <p className="type-meta font-semibold text-primary">
            {ADMIN_FEEDBACK_CATEGORY_LABEL[feedback.category]}
          </p>
          <h2 className="mt-2 type-section text-foreground">{feedback.subject}</h2>
          <p className="mt-1 type-row-secondary text-muted">
            {feedback.seller.storeName ?? feedback.seller.name ?? "Mağaza"}
          </p>
        </div>
        <StatusChip tone={presentation.tone}>{presentation.label}</StatusChip>
      </div>

      <p className="whitespace-pre-wrap rounded-sheet border border-boundary/60 bg-sunken p-5 type-body text-foreground">
        {feedback.message}
      </p>

      <dl className="grid gap-4 sm:grid-cols-3">
        <Meta label="Gönderildi" value={formatDateTime(feedback.createdAt)} />
        <Meta label="Güncellendi" value={formatDateTime(feedback.updatedAt)} />
        <Meta label="Çözüldü" value={feedback.resolvedAt ? formatDateTime(feedback.resolvedAt) : "Henüz değil"} />
      </dl>

      <div className="flex flex-wrap items-center gap-3 border-t border-divider pt-5">
        <Link
          href={feedbackHref({ status, category, sellerId: feedback.seller.id })}
          className="type-row-secondary font-semibold text-primary hover:underline"
        >
          Bu mağazanın geri bildirimleri
        </Link>
        <Link
          href={`/admin/sellers?seller=${feedback.seller.id}` as Route}
          className="type-row-secondary font-semibold text-primary hover:underline"
        >
          Mağazayı aç
        </Link>
      </div>

      <FeedbackActions feedback={feedback} />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="type-meta text-muted-foreground">{label}</dt>
      <dd className="mt-1 type-row-primary text-foreground">{value}</dd>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
