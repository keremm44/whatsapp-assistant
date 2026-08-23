"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getBrowserAccessToken } from "@/lib/supabase/client";
import { updateAdminFeedback, type AdminFeedback } from "@/lib/admin/feedback-api";
import type { AdminFeedbackStatus } from "@/lib/admin/feedback-format";
import { useToast } from "@/lib/toast/use-toast";

export function FeedbackActions({ feedback }: { feedback: AdminFeedback }) {
  const r = useRouter();
  const toast = useToast();
  const [note, setNote] = useState(feedback.adminNote ?? "");
  const [status, setStatus] = useState<AdminFeedbackStatus>(feedback.status);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setMsg(null);
    const t = await getBrowserAccessToken();
    if (!t) {
      setMsg("Oturum bilgisi alınamadı.");
      return;
    }
    try {
      await updateAdminFeedback(t, feedback.id, {
        expectedVersion: feedback.version,
        status,
        adminNote: note.trim() || undefined,
      });
      toast.success("Geri bildirim güncellendi.");
      start(() => r.refresh());
    } catch (e) {
      const s =
        e && typeof e === "object" && "status" in e
          ? (e as { status?: number }).status
          : 0;
      setMsg(
        s === 409
          ? "Kayıt başka bir işlem tarafından güncellendi. Sayfayı yenileyip tekrar deneyin."
          : "Geri bildirim şu anda güncellenemedi.",
      );
    }
  };

  return (
    <div className="space-y-3 border-t border-divider pt-5">
      <label className="block type-meta text-muted-foreground">
        DURUM
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as AdminFeedbackStatus)}
          className="mt-1 block w-full rounded-control border border-boundary bg-control px-3 py-2 type-row-secondary text-foreground"
        >
          <option value="OPEN">Açık</option>
          <option value="IN_REVIEW">İnceleniyor</option>
          <option value="RESOLVED">Çözüldü</option>
        </select>
      </label>
      <label className="block type-meta text-muted-foreground">
        ADMIN NOTU
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={4000}
          className="mt-1 min-h-24 w-full rounded-control border border-boundary bg-control px-3 py-2 type-row-secondary text-foreground"
        />
      </label>
      {msg ? (
        <p role="alert" className="type-row-secondary text-destructive">
          {msg}
        </p>
      ) : null}
      <Button type="button" size="md" onClick={save} disabled={pending}>
        {pending ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
      </Button>
    </div>
  );
}
