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
import { resolveSession } from "@/lib/supabase/session";
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
    const session = await resolveSession();
    if (!session) return { state: "auth_rejected" };

    const data = await fetchAnalyticsSummary(session.accessToken, period);

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
