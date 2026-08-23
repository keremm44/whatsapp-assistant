"use client";

/**
 * Toaster — ekranın sağ alt köşesinde yığılan toast bildirimleri.
 *
 * Tasarım kararları:
 *   - `seller-shell.tsx` içine, `<main>` kardeşi olarak, tek seferlik
 *     monte edilir. Çift mount olursa toastlar iki kez gösterilir.
 *   - Pozisyon: `fixed bottom-5 right-5` — mobil bottom nav ile çakışmayı
 *     önlemek için `pb-20 md:pb-0` offset uygulanır.
 *   - Animasyon: mevcut `slide-in-bottom` + `fade-in` token'ları kullanılır.
 *   - Auto-dismiss: her toast kendi `durationMs` süresinden sonra silinir.
 *     Hover'da pause yoktur (V1 kapsam dışı).
 *   - Manuel kapatma: her toast'ta × düğmesi vardır.
 *   - Ton → renk eşleşmesi design token'lara bağlıdır (success, error,
 *     info, warning), hex hardcode yoktur.
 *   - aria-live="polite" → ekran okuyuculara bildirim yapılır.
 */

import * as React from "react";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import {
  removeToast,
  subscribeToasts,
  type ToastItem,
  type ToastTone,
} from "@/lib/toast/index";

/* ── Ton → stil eşlemesi ──────────────────────────────────────────── */

type ToneStyle = {
  container: string;
  icon: string;
  Icon: React.ElementType;
};

const TONE_STYLES: Record<ToastTone, ToneStyle> = {
  success: {
    container:
      "border-l-[3px] border-l-success bg-raised border border-boundary/60",
    icon: "text-success",
    Icon: CheckCircle2,
  },
  error: {
    container:
      "border-l-[3px] border-l-destructive bg-raised border border-boundary/60",
    icon: "text-destructive",
    Icon: AlertCircle,
  },
  info: {
    container:
      "border-l-[3px] border-l-info bg-raised border border-boundary/60",
    icon: "text-info",
    Icon: Info,
  },
  warning: {
    container:
      "border-l-[3px] border-l-warning bg-raised border border-boundary/60",
    icon: "text-warning",
    Icon: AlertTriangle,
  },
};

/* ── Tek toast kartı ──────────────────────────────────────────────── */

function ToastCard({ item }: { item: ToastItem }) {
  const style = TONE_STYLES[item.tone];
  const { Icon } = style;

  // Auto-dismiss
  React.useEffect(() => {
    const timer = setTimeout(() => removeToast(item.id), item.durationMs);
    return () => clearTimeout(timer);
  }, [item.id, item.durationMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "flex w-[320px] max-w-[calc(100vw-2.5rem)] items-start gap-3 rounded-sheet px-4 py-3 shadow-2",
        "motion-safe:animate-slide-in-bottom",
        style.container,
      )}
    >
      <Icon
        aria-hidden="true"
        size={16}
        strokeWidth={1.75}
        className={cn("mt-0.5 shrink-0", style.icon)}
      />
      <p className="min-w-0 flex-1 type-row-secondary text-foreground leading-snug">
        {item.message}
      </p>
      <button
        type="button"
        aria-label="Bildirimi kapat"
        onClick={() => removeToast(item.id)}
        className="shrink-0 rounded-control p-0.5 text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-raised"
      >
        <X size={13} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

/* ── Toaster container ────────────────────────────────────────────── */

export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    return subscribeToasts(setItems);
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      aria-label="Bildirimler"
      className={cn(
        "fixed bottom-5 right-5 z-50 flex flex-col gap-2.5",
        // Mobil bottom nav (pb-20) ile çakışmaması için
        "mb-16 md:mb-0",
      )}
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}
