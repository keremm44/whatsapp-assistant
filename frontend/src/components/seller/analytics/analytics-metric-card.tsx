import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Tek analytics metrik kartı.
 *
 * Tasarım: canvas üzerinde hafif raised yüzey, sol kenarda 3px
 * aksan çizgisi, büyük tabular rakam, alt açıklama.
 * Renk yalnızca aksan çizgisinde — içerik rengi yok.
 */
export type MetricTone = "neutral" | "primary" | "success" | "warning" | "info";

const TONE_BORDER: Record<MetricTone, string> = {
  neutral: "border-l-boundary",
  primary: "border-l-primary",
  success: "border-l-success",
  warning: "border-l-warning",
  info:    "border-l-info",
};

export function AnalyticsMetricCard({
  label,
  value,
  sub,
  tone = "neutral",
  className,
}: {
  label: string;
  /** Gösterilecek ana sayı veya metin */
  value: string | number;
  /** İsteğe bağlı alt satır (oran, birim vb.) */
  sub?: string;
  tone?: MetricTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-sheet border border-boundary/60 bg-raised px-4 py-3.5",
        "border-l-[3px]",
        TONE_BORDER[tone],
        className,
      )}
    >
      <p className="type-meta text-muted-foreground">{label}</p>
      <p className="type-figure font-semibold text-[1.75rem] leading-none text-foreground tabular-nums">
        {value}
      </p>
      {sub ? (
        <p className="type-meta text-muted-foreground">{sub}</p>
      ) : null}
    </div>
  );
}
