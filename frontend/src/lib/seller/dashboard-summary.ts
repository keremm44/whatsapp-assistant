/**
 * Dashboard QuietSummary model.
 *
 * Backend `toplam` is a real global filtered count. The page only
 * fetches the first 50 tasks. Priority high/normal counts derived
 * from that page are truthful only when the page is complete
 * (`tasks.length === total`). A partial page must not present those
 * page-local counts as if they were global.
 */

import type { DashboardTaskPriority } from "./dashboard-tasks.ts";

export type DashboardQuietSummaryModel =
  | {
      kind: "complete";
      high: number;
      normal: number;
      total: number;
    }
  | {
      kind: "partial";
      shown: number;
      total: number;
    };

const nonNegativeInt = (value: number): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;

export const buildDashboardQuietSummary = (input: {
  tasks: readonly { priority: DashboardTaskPriority }[];
  total: number;
}): DashboardQuietSummaryModel => {
  const shown = input.tasks.length;
  const total = nonNegativeInt(input.total);

  if (shown === total) {
    let high = 0;
    let normal = 0;
    for (const task of input.tasks) {
      if (task.priority === "high") high += 1;
      else normal += 1;
    }
    return { kind: "complete", high, normal, total };
  }

  return { kind: "partial", shown, total };
};
