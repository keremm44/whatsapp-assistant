const SIDEBAR_SUMMARY_ERROR_PREFIX = "sidebar_summary_invalid_";

export type SellerSidebarSummary = {
  returnsActionRequired: number;
  unansweredOpen: number;
  pausedOrTakenOver: number;
};

const readCount = (
  raw: Record<string, unknown>,
  key: string,
): number => {
  const value = raw[key];
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(`${SIDEBAR_SUMMARY_ERROR_PREFIX}${key}`);
  }
  return value;
};

export const parseSellerSidebarSummary = (
  raw: unknown,
): SellerSidebarSummary => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${SIDEBAR_SUMMARY_ERROR_PREFIX}response`);
  }
  const record = raw as Record<string, unknown>;
  return {
    returnsActionRequired: readCount(record, "returns_action_required"),
    unansweredOpen: readCount(record, "unanswered_open"),
    pausedOrTakenOver: readCount(record, "paused_or_taken_over"),
  };
};

export const countForSellerHref = (
  summary: SellerSidebarSummary | null,
  href: string,
): number | null => {
  if (!summary) return null;
  if (href === "/seller/returns") return summary.returnsActionRequired;
  if (href === "/seller/unanswered") return summary.unansweredOpen;
  if (href === "/seller/paused") return summary.pausedOrTakenOver;
  return null;
};

export const formatSidebarCount = (count: number): string =>
  count > 99 ? "99+" : String(count);

export const SIDEBAR_SUMMARY_CONTRACT_ERROR_PREFIX =
  SIDEBAR_SUMMARY_ERROR_PREFIX;
