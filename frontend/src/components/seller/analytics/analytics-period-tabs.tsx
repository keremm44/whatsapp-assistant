"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils/cn";
import type { AnalyticsPeriod } from "@/lib/seller/analytics-api";

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "week",  label: "Son 7 gün"  },
  { value: "month", label: "Son 30 gün" },
];

/**
 * Periyot seçici — URL query param üzerinden çalışır (?period=week|month).
 * Sekme tıklandığında sayfa server-side yeniden render edilir.
 */
export function AnalyticsPeriodTabs({
  currentPeriod,
}: {
  currentPeriod: AnalyticsPeriod;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSelect = (period: AnalyticsPeriod) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div
      role="tablist"
      aria-label="Analitik periyodu"
      className="flex gap-1 rounded-control border border-boundary/60 bg-sunken p-0.5"
    >
      {PERIODS.map(({ value, label }) => {
        const isActive = value === currentPeriod;
        return (
          <button
            key={value}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => handleSelect(value)}
            className={cn(
              "rounded-control px-3 py-1.5 type-meta font-medium transition-colors",
              isActive
                ? "bg-raised text-foreground shadow-1"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
