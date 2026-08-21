import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAdminAnnouncements } from "@/lib/admin/announcements-api";
import { AnnouncementForm } from "@/components/admin/announcement-form";

export default async function Page() {
  let items: Awaited<ReturnType<typeof fetchAdminAnnouncements>> | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const session = await supabase.auth.getSession();
    if (session.data.session?.access_token) items = await fetchAdminAnnouncements(session.data.session.access_token);
  } catch {
    // The page keeps its neutral unavailable state.
  }

  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <PageHeader caption="YÖNETİM" title="Duyurular" description="Aktif seller’lara uygulama içi duyurular gönderin." />
      <section className="mb-8 max-w-2xl" aria-labelledby="new-announcement-heading">
        <div className="mb-3">
          <h2 id="new-announcement-heading" className="type-section text-foreground">Yeni duyuru</h2>
          <p className="mt-1 type-row-secondary text-muted">Duyuruyu hazırlayın; yayınlandığında seller panelindeki zile düşer.</p>
        </div>
        <AnnouncementForm />
      </section>
      <div className="overflow-hidden rounded-sheet border border-boundary/70 bg-raised shadow-surface">
        {items ? (
          <ul className="divide-y divide-divider">
            {items.map((announcement) => (
              <li key={announcement.id} className="p-5">
                <div className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="type-row-primary text-foreground">{announcement.title}</p>
                      {announcement.importance === "IMPORTANT" ? <span className="rounded-pill bg-attention/15 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-attention">ÖNEMLİ</span> : null}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap type-row-secondary text-muted">{announcement.message}</p>
                    {announcement.imageUrl ? <div className="mt-3 aspect-video max-w-sm overflow-hidden rounded-control bg-sunken"><img src={announcement.imageUrl} alt="" className="h-full w-full object-cover" /></div> : null}
                  </div>
                  <p className="shrink-0 type-meta text-muted-foreground">{announcement.targetCount} hedef · {announcement.readCount} okundu</p>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="p-6 type-body text-muted">Duyurular şu anda yüklenemedi.</p>}
      </div>
    </PageContainer>
  );
}
