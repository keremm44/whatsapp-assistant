import * as React from "react";

import { AnalyticsMetricCard } from "./analytics-metric-card";
import { AnalyticsPeriodTabs } from "./analytics-period-tabs";
import type { AnalyticsBootstrap } from "@/lib/seller/analytics-server";
import type { AnalyticsPeriod } from "@/lib/seller/analytics-api";

/**
 * Analytics section — dashboard'un üst kısmında yer alan
 * haftalık/aylık özet kartları.
 *
 * Server Component. Veri layout tarafından çözülür ve
 * bootstrap prop olarak geçirilir. Periyot değişimi URL
 * query param ile yönetilir (AnalyticsPeriodTabs client component).
 */
export function AnalyticsSection({
  bootstrap,
  period,
}: {
  bootstrap: AnalyticsBootstrap;
  period: AnalyticsPeriod;
}) {
  // Veri yoksa sessizce hiçbir şey gösterme
  if (bootstrap.state !== "ready") {
    return null;
  }

  const m = bootstrap.metrics;

  // Otomasyon oranını % string'e çevir
  const autoRateDisplay =
    m.outgoing_messages > 0
      ? `%${Math.round(m.auto_reply_rate * 100)}`
      : "—";

  return (
    <section aria-label="Analitik özeti" className="space-y-4">
      {/* Başlık + periyot seçici */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="type-row-primary text-foreground">Dönem özeti</h2>
          <p className="type-meta text-muted-foreground">
            {period === "week" ? "Son 7 gün" : "Son 30 gün"}
          </p>
        </div>
        <AnalyticsPeriodTabs currentPeriod={period} />
      </div>

      {/* Metrik kartları — 2 kolonlu grid, mobilde tek kolon */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <AnalyticsMetricCard
          label="Gelen mesaj"
          value={m.incoming_messages.toLocaleString("tr-TR")}
          tone="neutral"
        />
        <AnalyticsMetricCard
          label="Asistan yanıtı"
          value={m.auto_replied_messages.toLocaleString("tr-TR")}
          sub={`Otomasyon ${autoRateDisplay}`}
          tone="primary"
        />
        <AnalyticsMetricCard
          label="Yeni sipariş"
          value={m.new_orders.toLocaleString("tr-TR")}
          sub={`${m.completed_orders.toLocaleString("tr-TR")} tamamlandı`}
          tone="success"
        />
        <AnalyticsMetricCard
          label="Açık iade"
          value={m.open_returns.toLocaleString("tr-TR")}
          sub={
            m.resolved_returns > 0
              ? `${m.resolved_returns.toLocaleString("tr-TR")} kapandı`
              : undefined
          }
          tone={m.open_returns > 0 ? "warning" : "neutral"}
        />
        <AnalyticsMetricCard
          label="Bekleyen soru"
          value={m.unanswered_questions.toLocaleString("tr-TR")}
          tone={m.unanswered_questions > 0 ? "info" : "neutral"}
        />
      </div>

      {/* Ayırıcı çizgi */}
      <div className="border-t border-divider" aria-hidden="true" />
    </section>
  );
}
