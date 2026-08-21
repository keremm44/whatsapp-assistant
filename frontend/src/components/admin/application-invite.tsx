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
import { inviteAdminApplication } from "@/lib/admin/applications-api";
import { getBrowserAccessToken } from "@/lib/supabase/client";

export function ApplicationInvite({
  id,
  email,
}: {
  id: number;
  email: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState(email ?? "");
  const [adminNote, setAdminNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshPending, startTransition] = useTransition();
  const pending = submitting || refreshPending;

  const send = async () => {
    if (submitting || !inviteEmail.trim()) return;
    setMessage(null);
    setSubmitting(true);

    try {
      const token = await getBrowserAccessToken();
      if (!token) {
        setMessage("Oturum bilgisi alınamadı.");
        return;
      }

      await inviteAdminApplication(token, id, {
        email: inviteEmail.trim() || undefined,
        adminNote: adminNote.trim() || undefined,
      });
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (error) {
      const status =
        error && typeof error === "object" && "status" in error
          ? (error as { status?: number }).status
          : 0;
      setMessage(
        status === 409
          ? "Bu başvuru artık davet edilebilir durumda değil. Sayfayı yenileyip tekrar kontrol edin."
          : "Davet şu anda gönderilemedi.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="md"
        onClick={() => {
          setMessage(null);
          setOpen(true);
        }}
      >
        Seller daveti gönder
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => !submitting && setOpen(nextOpen)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seller daveti</DialogTitle>
            <DialogDescription>
              Başvuru seller hesabına dönüştürülecek ve bu adrese giriş daveti gönderilecek.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <label className="block type-meta text-muted-foreground">
              DAVET E-POSTASI
              <input
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                type="email"
                autoComplete="email"
                disabled={submitting}
                className="mt-1 block w-full rounded-control border border-boundary bg-control px-3 py-2 type-row-secondary text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label className="block type-meta text-muted-foreground">
              ADMIN NOTU
              <textarea
                value={adminNote}
                onChange={(event) => setAdminNote(event.target.value)}
                maxLength={1000}
                disabled={submitting}
                placeholder="Davet kararına ilişkin isteğe bağlı iç not"
                className="mt-1 min-h-24 w-full rounded-control border border-boundary bg-control px-3 py-2 type-row-secondary text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            {message ? (
              <p role="alert" className="type-row-secondary text-destructive">
                {message}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              İptal
            </Button>
            <Button type="button" onClick={send} disabled={pending || !inviteEmail.trim()}>
              {submitting ? "Gönderiliyor…" : "Daveti gönder"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
