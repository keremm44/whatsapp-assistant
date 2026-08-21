"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createAdminAnnouncement } from "@/lib/admin/announcements-api";
import { fetchAdminSellers, type AdminSeller } from "@/lib/admin/sellers-api";
import { getBrowserAccessToken } from "@/lib/supabase/client";

const DIRECTORY_PAGE_SIZE = 50;

type DirectoryPage = {
  sellers: AdminSeller[];
  total: number;
  offset: number;
};

export function AnnouncementForm({
  initialSellers,
  initialSellerTotal,
}: {
  initialSellers: AdminSeller[];
  initialSellerTotal: number;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshPending, startTransition] = useTransition();

  const [directory, setDirectory] = useState<DirectoryPage>({
    sellers: initialSellers,
    total: initialSellerTotal,
    offset: 0,
  });
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  const pending = submitting || refreshPending;

  const toggleSeller = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const canPublish =
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    (audience === "all" || selectedIds.length > 0);

  const loadDirectory = async (offset: number, query = directoryQuery) => {
    if (directoryLoading) return;
    setDirectoryLoading(true);
    setDirectoryError(null);
    try {
      const token = await getBrowserAccessToken();
      if (!token) {
        setDirectoryError("Mağaza listesi için oturum bilgisi alınamadı.");
        return;
      }
      const page = await fetchAdminSellers(token, {
        q: query.trim() || undefined,
        limit: DIRECTORY_PAGE_SIZE,
        offset,
      });
      setDirectory({ sellers: page.sellers, total: page.total, offset: page.offset });
    } catch {
      setDirectoryError("Mağaza listesi şu anda yenilenemedi.");
    } finally {
      setDirectoryLoading(false);
    }
  };

  const publish = async () => {
    if (submitting || !canPublish) return;
    setError(null);
    setSubmitting(true);

    try {
      const token = await getBrowserAccessToken();
      if (!token) {
        setError("Oturum bilgisi alınamadı.");
        return;
      }
      await createAdminAnnouncement(
        token,
        title.trim(),
        message.trim(),
        audience === "selected" ? selectedIds : undefined,
      );
      setTitle("");
      setMessage("");
      setAudience("all");
      setSelectedIds([]);
      setConfirmOpen(false);
      startTransition(() => router.refresh());
    } catch {
      setError("Duyuru şu anda yayımlanamadı. Hedef kitleyi ve içeriği kontrol edip tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  };

  const hasPreviousDirectoryPage = directory.offset > 0;
  const hasNextDirectoryPage = directory.offset + directory.sellers.length < directory.total;
  const firstShown = directory.total === 0 ? 0 : directory.offset + 1;
  const lastShown = Math.min(directory.offset + directory.sellers.length, directory.total);

  return (
    <div className="rounded-sheet border border-boundary/70 bg-raised shadow-surface">
      <div className="border-b border-divider px-5 py-4 sm:px-6">
        <p className="type-meta font-semibold text-primary">YENİ DUYURU</p>
        <h2 className="mt-1 type-section text-foreground">Seller’lara yayınla</h2>
        <p className="mt-1 type-row-secondary text-muted">
          Mesajı hazırlayın, hedef kitleyi seçin ve yayınlamadan önce son kez doğrulayın.
        </p>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <label className="block type-meta text-muted-foreground">
          BAŞLIK
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            disabled={submitting}
            placeholder="Duyuru başlığı"
            className="mt-1 block w-full rounded-control border border-boundary bg-control px-3 py-2.5 type-row-secondary text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          />
          <span className="mt-1 block text-right type-meta text-muted-foreground">{title.length}/200</span>
        </label>

        <label className="block type-meta text-muted-foreground">
          MESAJ
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={4000}
            disabled={submitting}
            placeholder="Seller’ların duyuru merkezinde göreceği mesaj"
            className="mt-1 min-h-32 w-full resize-y rounded-control border border-boundary bg-control px-3 py-2.5 type-row-secondary text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          />
          <span className="mt-1 block text-right type-meta text-muted-foreground">{message.length}/4000</span>
        </label>

        <fieldset className="border-t border-divider pt-5" disabled={submitting}>
          <legend className="type-meta text-muted-foreground">HEDEF KİTLE</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className={`rounded-sheet border p-4 ${audience === "all" ? "border-primary/45 bg-selected/45" : "border-boundary/60 bg-sunken"}`}>
              <span className="flex items-start gap-3">
                <input
                  type="radio"
                  name="announcement-audience"
                  checked={audience === "all"}
                  onChange={() => setAudience("all")}
                  className="mt-1"
                />
                <span>
                  <span className="block type-row-primary text-foreground">Tüm aktif seller’lar</span>
                  <span className="mt-1 block type-row-secondary text-muted">
                    Yayın anında aktif mağazalar hedeflenir.
                  </span>
                </span>
              </span>
            </label>
            <label className={`rounded-sheet border p-4 ${audience === "selected" ? "border-primary/45 bg-selected/45" : "border-boundary/60 bg-sunken"}`}>
              <span className="flex items-start gap-3">
                <input
                  type="radio"
                  name="announcement-audience"
                  checked={audience === "selected"}
                  onChange={() => setAudience("selected")}
                  className="mt-1"
                />
                <span>
                  <span className="block type-row-primary text-foreground">Belirli mağazalar</span>
                  <span className="mt-1 block type-row-secondary text-muted">
                    Yalnızca seçtiğiniz mağazalar hedeflenir.
                  </span>
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {audience === "selected" ? (
          <div className="overflow-hidden rounded-sheet border border-boundary/60 bg-sunken">
            <div className="border-b border-divider px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="type-meta font-semibold text-muted-foreground">MAĞAZA SEÇİMİ</p>
                <span className="type-figure text-sm font-semibold text-foreground">{selectedIds.length} seçili</span>
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadDirectory(0);
                }}
              >
                <input
                  value={directoryQuery}
                  onChange={(event) => setDirectoryQuery(event.target.value)}
                  placeholder="Mağaza veya yetkili ara"
                  disabled={directoryLoading || submitting}
                  className="min-w-0 flex-1 rounded-control border border-boundary bg-control px-3 py-2 type-row-secondary text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                />
                <Button type="submit" size="sm" variant="secondary" disabled={directoryLoading || submitting}>
                  {directoryLoading ? "Aranıyor…" : "Ara"}
                </Button>
              </form>
              <p className="mt-2 type-meta text-muted-foreground">
                {directory.total} sonuç · {firstShown}-{lastShown} gösteriliyor
              </p>
            </div>

            {directoryError ? (
              <p role="alert" className="border-b border-divider px-4 py-3 type-row-secondary text-destructive">
                {directoryError}
              </p>
            ) : null}

            <div className="max-h-64 overflow-y-auto">
              {directory.sellers.length ? (
                <ul className="divide-y divide-divider" aria-label="Duyuru hedefi seçilebilecek mağazalar">
                  {directory.sellers.map((seller) => (
                    <li key={seller.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-elevated">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(seller.id)}
                          onChange={() => toggleSeller(seller.id)}
                          disabled={submitting}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate type-row-primary text-foreground">{seller.storeName}</span>
                          <span className="block truncate type-row-secondary text-muted">{seller.name}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-4 type-row-secondary text-muted">Bu aramada mağaza bulunamadı.</p>
              )}
            </div>

            {(hasPreviousDirectoryPage || hasNextDirectoryPage) ? (
              <div className="flex items-center justify-between gap-3 border-t border-divider px-4 py-3">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!hasPreviousDirectoryPage || directoryLoading || submitting}
                  onClick={() => void loadDirectory(Math.max(0, directory.offset - DIRECTORY_PAGE_SIZE))}
                >
                  Önceki
                </Button>
                <span className="type-meta text-muted-foreground">
                  Sayfa {Math.floor(directory.offset / DIRECTORY_PAGE_SIZE) + 1}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!hasNextDirectoryPage || directoryLoading || submitting}
                  onClick={() => void loadDirectory(directory.offset + DIRECTORY_PAGE_SIZE)}
                >
                  Sonraki
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <p role="alert" className="type-row-secondary text-destructive">{error}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-divider pt-5">
          <p className="type-row-secondary text-muted">
            {audience === "all" ? "Tüm aktif seller’lara yayınlanacak." : `${selectedIds.length} mağaza hedeflenecek.`}
          </p>
          <Button type="button" onClick={() => setConfirmOpen(true)} disabled={!canPublish || pending}>
            Yayını gözden geçir
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(nextOpen) => !submitting && setConfirmOpen(nextOpen)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duyuruyu yayınla</DialogTitle>
            <DialogDescription>
              Yayınlandıktan sonra duyuru hedeflenen seller’ların duyuru merkezinde görünür.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-sheet border border-boundary/60 bg-sunken p-4">
            <p className="type-row-primary text-foreground">{title.trim()}</p>
            <p className="mt-2 whitespace-pre-wrap type-row-secondary text-muted">{message.trim()}</p>
            <p className="mt-4 border-t border-divider pt-3 type-meta text-muted-foreground">
              {audience === "all" ? "Hedef: tüm aktif seller’lar" : `Hedef: ${selectedIds.length} seçili mağaza`}
            </p>
          </div>
          {error ? <p role="alert" className="type-row-secondary text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Geri dön
            </Button>
            <Button type="button" onClick={publish} disabled={pending}>
              {submitting ? "Yayımlanıyor…" : "Duyuruyu yayınla"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
