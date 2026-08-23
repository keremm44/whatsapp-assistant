/**
 * Analytics API — GET /seller/analytics/summary
 *
 * Backend sözleşmesi:
 *   period: "week" | "month"
 *   since:  ISO timestamp
 *   metrics: {
 *     incoming_messages, outgoing_messages,
 *     auto_replied_messages, manual_replied_msgs,
 *     auto_reply_rate (0.0–1.0),
 *     new_orders, completed_orders,
 *     open_returns, resolved_returns,
 *     unanswered_questions
 *   }
 */

import { apiFetchWithAccessToken } from "@/lib/api/authenticated";

export type AnalyticsPeriod = "week" | "month";

export type AnalyticsMetrics = {
  incoming_messages: number;
  outgoing_messages: number;
  auto_replied_messages: number;
  manual_replied_msgs: number;
  auto_reply_rate: number;
  new_orders: number;
  completed_orders: number;
  open_returns: number;
  resolved_returns: number;
  unanswered_questions: number;
};

export type AnalyticsSummaryResponse = {
  period: AnalyticsPeriod;
  since: string;
  metrics: AnalyticsMetrics;
};

export async function fetchAnalyticsSummary(
  accessToken: string,
  period: AnalyticsPeriod = "week",
): Promise<AnalyticsSummaryResponse> {
  return apiFetchWithAccessToken<AnalyticsSummaryResponse>(
    `/seller/analytics/summary?period=${period}`,
    accessToken,
  );
}
