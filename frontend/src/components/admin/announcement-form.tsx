"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getBrowserAccessToken } from "@/lib/supabase/client";
import { createAdminAnnouncement, type AdminAnnouncementImportance } from "@/lib/admin/announcements-api";

export function AnnouncementForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [importance, setImportance] = useState<AdminAnnouncementImportance>("NORMAL");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const publish = async () => {
    setError(null);
    if (!title.trim() || !message.trim()) {
      setError("Başlık ve mesaj zorunludur.");
      return;
    }
    if (imageUrl.trim() && !imageUrl.trim().startsWith("https://")) {
      setError("Görsel bağlantısı HTTPS ile başlamalıdır.");
      return;
    }
    const token = await getBrowserAccessToken();
    if (!token) {
      setError("Oturum bilgisi alınamadı.");
      return;
    }
    try {
      await createAdminAnnouncement(token, title.trim(), message.trim(), {
        importance,
        imageUrl: imageUrl.trim() || undefined,
      });
      setTitle("");
      setMessage("");
      setImageUrl("");
      setImportance("NORMAL");
      startTransition(() => router.refresh());
    } catch {
      setError("Duyuru şu anda yayımlanamadı.");
    }
  };

  return (
    <div className="flex w-full flex-col gap-3 rounded-sheet border border-boundary/70 bg-sunken p-4 sm:min-w-[340px] sm:max-w-[520px]">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Duyuru başlığı" maxLength={200} className="rounded-control border border-boundary bg-control px-3 py-2 type-row-secondary text-foreground" />
        <label className="flex items-center gap-2 rounded-control border border-boundary bg-control px-3 py-2 type-meta text-muted-foreground">
          <input type="checkbox" checked={importance === "IMPORTANT"} onChange={(event) => setImportance(event.target.checked ? "IMPORTANT" : "NORMAL")} />
          Önemli
        </label>
      </div>
      <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Duyuru mesajı" maxLength={4000} className="min-h-24 rounded-control border border-boundary bg-control px-3 py-2 type-row-secondary text-foreground" />
      <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="16:9 görsel URL’si (opsiyonel)" maxLength={2048} inputMode="url" className="rounded-control border border-boundary bg-control px-3 py-2 type-row-secondary text-foreground" />
      <div className="flex items-center justify-between gap-3">
        <span className="type-meta text-muted-foreground">Tüm aktif seller’lara yayınlanır</span>
        <Button onClick={publish} disabled={pending}>{pending ? "Yayımlanıyor…" : "Yayınla"}</Button>
      </div>
      {error ? <span className="type-meta text-destructive" role="alert">{error}</span> : null}
    </div>
  );
}
