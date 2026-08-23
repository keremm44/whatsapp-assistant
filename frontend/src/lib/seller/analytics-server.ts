/**
 * Server-side analytics resolver.
 *
 * Server Component'lardan çağrılır. Supabase session'ından
 * access token alır, backend'den analytics özetini çeker.
 *
 * State machine:
 *   ready        — veri başarıyla alındı
 *   unavailable  — backend erişilemiyor veya 5xx
 *   auth_rejected — 401 (session süresi dolmuş)
 */

import { ApiError } from "@/lib/api/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAnalyticsSummary,
  type AnalyticsMetrics,
  type AnalyticsPeriod,
} from "./analytics-api";

export type AnalyticsBootstrap =
  | { state: "ready"; period: AnalyticsPeriod; since: string; metrics: AnalyticsMetrics }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

export async function resolveAnalyticsFromSession(
  period: AnalyticsPeriod = "week",
): Promise<AnalyticsBootstrap> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;
    if (!accessToken) {
      return { state: "auth_rejected" };
    }

    const data = await fetchAnalyticsSummary(accessToken, period);

    return {
      state: "ready",
      period: data.period,
      since: data.since,
      metrics: data.metrics,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { state: "auth_rejected" };
    }
    return { state: "unavailable" };
  }
}
