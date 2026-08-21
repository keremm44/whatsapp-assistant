import type { Route } from "next";
import Link from "next/link";

import { ApplicationInvite } from "@/components/admin/application-invite";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip, type StatusChipTone } from "@/components/shared/status-chip";
import type { AdminApplication } from "@/lib/admin/applications-api";
import { resolveAdminApplications } from "@/lib/admin/applications-server";

const statuses = ["pending", "contacted", "approved", "rejected", "cancelled"] as const;
const labels: Record<AdminApplication["status"], string> = {
  pending: "Yeni",
  contacted: "İletişime geçildi",
  approved: "Davet edildi",
  rejected: "Uygun değil",
  cancelled: "İptal",
};

const tones: Record<AdminApplication["status"], StatusChipTone> = {
  pending: "muted",
  contacted: "muted",
  approved: "success",
  rejected: "muted",
  cancelled: "muted",
};

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

function hrefFor(input: { status?: AdminApplication["status"]; application?: number }) {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  if (input.application) params.set("application", String(input.application));
  return `/admin/applications${params.size ? `?${params}` : ""}` as Route;
}

function tabClass(active: boolean) {
  return `border-b-2 px-1 py-2 type-meta transition-colors ${active ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`;
}

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawStatus = one(params.status);
  const status = statuses.includes(rawStatus as AdminApplication["status"])
    ? (rawStatus as AdminApplication["status"])
    : undefined;
  const selectedId = Number(one(params.application));
  const result = await resolveAdminApplications(status);
  const selected =
    result.state === "ready" && Number.isInteger(selectedId) && selectedId > 0
      ? result.data.applications.find((item) => item.id === selectedId) ?? null
      : null;

  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <PageHeader
        caption="YÖNETİM"
        title="Başvurular"
        description="Yeni mağaza adaylarını inceleyin ve davet için gerekli bağlamı tek yerde görün."
      />

      <div className="mt-8 grid overflow-hidden rounded-sheet border border-boundary/70 bg-raised shadow-surface lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="border-b border-divider lg:border-b-0 lg:border-r">
          <div className="border-b border-divider px-4 pt-4">
            <div className="flex items-center justify-between gap-3 pb-2">
              <p className="type-meta font-semibold text-primary">BAŞVURU KUYRUĞU</p>
              {result.state === "ready" ? (
                <span className="type-figure text-sm font-semibold text-muted-foreground">
                  {result.data.total}
                </span>
              ) : null}
            </div>
            <nav className="flex flex-wrap gap-x-4" aria-label="Başvuru durumu">
              <Link href={hrefFor({})} className={tabClass(!status)}>
                Tümü
              </Link>
              {statuses.map((item) => (
                <Link
                  key={item}
                  href={hrefFor({ status: item })}
                  className={tabClass(status === item)}
                >
                  {labels[item]}
                </Link>
              ))}
            </nav>
          </div>

          {result.state === "ready" ? (
            result.data.applications.length ? (
              <ul className="divide-y divide-divider" aria-label="Başvurular">
                {result.data.applications.map((application) => (
                  <li key={application.id}>
                    <Link
                      href={hrefFor({ status, application: application.id })}
                      className={`block px-4 py-4 transition-colors hover:bg-elevated ${selected?.id === application.id ? "bg-selected/55" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate type-row-primary text-foreground">
                            {application.storeName}
                          </p>
                          <p className="mt-0.5 truncate type-row-secondary text-muted">
                            {application.fullName} · {application.phone}
                          </p>
                        </div>
                        <StatusChip tone={tones[application.status]}>
                          {labels[application.status]}
                        </StatusChip>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-5 type-row-secondary text-muted">
                Bu filtrede başvuru yok.
              </p>
            )
          ) : (
            <p className="p-5 type-row-secondary text-muted">
              Başvurular şu anda yüklenemedi.
            </p>
          )}
        </aside>

        <section className="min-h-[500px] p-5 sm:p-6 lg:p-7">
          {selected ? (
            <ApplicationDetail application={selected} />
          ) : result.state === "ready" ? (
            <div className="hidden min-h-[420px] items-center justify-center text-center lg:flex">
              <div className="max-w-sm">
                <p className="type-record-identity text-foreground">Başvuru bağlamı</p>
                <p className="mt-2 type-body text-muted">
                  İncelemek için soldaki kuyruktan bir mağaza adayı seçin.
                </p>
              </div>
            </div>
          ) : (
            <p className="type-body text-muted">Başvuru detayı şu anda kullanılamıyor.</p>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

function ApplicationDetail({ application }: { application: AdminApplication }) {
  const canInvite = application.status === "pending" || application.status === "contacted";
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-divider pb-5">
        <div>
          <p className="type-meta font-semibold text-primary">BAŞVURU DETAYI</p>
          <h2 className="mt-2 type-section text-foreground">{application.storeName}</h2>
          <p className="mt-1 type-row-secondary text-muted">{application.fullName}</p>
        </div>
        <StatusChip tone={tones[application.status]}>{labels[application.status]}</StatusChip>
      </div>

      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <Detail label="Telefon" value={application.phone} />
        <Detail label="E-posta" value={application.email ?? "Belirtilmedi"} />
        <Detail label="Ürün kategorisi" value={application.productCategory ?? "Belirtilmedi"} />
        <Detail
          label="Başvuru tarihi"
          value={new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(
            new Date(application.createdAt),
          )}
        />
      </dl>

      {application.storeLink ? (
        <div className="border-t border-divider pt-5">
          <a
            href={application.storeLink}
            target="_blank"
            rel="noreferrer"
            className="type-row-secondary font-semibold text-primary hover:underline"
          >
            Mağaza bağlantısını aç
          </a>
        </div>
      ) : null}

      <div className="grid gap-4 border-t border-divider pt-5 lg:grid-cols-2">
        <Note title="BAŞVURU NOTU" value={application.notes} />
        <Note title="ADMIN NOTU" value={application.adminNote} />
      </div>

      {canInvite ? (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-divider pt-5">
          <p className="max-w-xl type-row-secondary text-muted">
            Davet, bu başvuruyu seller hesabına dönüştürür. Yalnızca yeni veya iletişime geçilmiş başvurularda gönderilebilir.
          </p>
          <ApplicationInvite id={application.id} email={application.email} />
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="type-meta text-muted-foreground">{label}</dt>
      <dd className="mt-1 type-row-primary text-foreground">{value}</dd>
    </div>
  );
}

function Note({ title, value }: { title: string; value: string | null }) {
  return (
    <div className="rounded-sheet border border-boundary/60 bg-sunken p-4">
      <p className="type-meta text-muted-foreground">{title}</p>
      <p className="mt-2 whitespace-pre-wrap type-row-secondary text-muted">
        {value || "Not eklenmemiş."}
      </p>
    </div>
  );
}
