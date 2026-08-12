"use client";

import { SellerFreshnessNotice } from "@/components/seller/freshness/seller-freshness-banner";
import { fetchDashboardTasks } from "@/lib/seller/dashboard-tasks";
import {
  buildDashboardFreshnessSignature,
  signaturesDiffer,
} from "@/lib/seller/freshness";
import { getBrowserAccessToken } from "@/lib/supabase/client";

/**
 * Dashboard first-page freshness. There is no local draft on this
 * surface; Yenile still goes through the same explicit refresh path
 * as the other seller work queues for consistency.
 */
export function DashboardFreshness({ signature }: { signature: string }) {
  return (
    <SellerFreshnessNotice
      enabled={true}
      check={async (signal) => {
        const accessToken = await getBrowserAccessToken();
        if (!accessToken) return false;
        const page = await fetchDashboardTasks(accessToken, { signal });
        return signaturesDiffer(
          signature,
          buildDashboardFreshnessSignature(page.tasks),
        );
      }}
    />
  );
}
