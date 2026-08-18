/**
 * Conservative V1 freshness signatures for seller work surfaces.
 *
 * Background checks compare a small, stable first-page identity
 * (ids + versions + backend freshness timestamps when available, or
 * the proven attention/control identity for conversations). They never
 * invent a count of new records and never claim what changed — only
 * that the current first page no longer matches the page the seller is
 * looking at.
 *
 * Dashboard is the exception that also includes the REAL global
 * filtered total: the first 50 tasks can stay identical while
 * task 51 appears, and that must still surface “Yeni bilgiler var”.
 */

/** Calm interval: visible-tab only, not a realtime stream. */
export const SELLER_FRESHNESS_INTERVAL_MS = 50_000;

export const SELLER_FRESHNESS_COPY = {
  message: "Yeni bilgiler var",
  action: "Yenile",
} as const;

/**
 * Generic queue identity. `version` remains the concurrency source of
 * truth; timestamps are an additional backend-provided freshness hint
 * for records whose contracts expose one.
 */
export const buildIdVersionSignature = (
  items: readonly {
    id: number;
    version: number;
    updatedAt?: string | null;
    lastSeenAt?: string | null;
  }[],
): string =>
  items
    .map((item) => {
      const timestamp = item.updatedAt ?? item.lastSeenAt ?? null;
      return timestamp === null
        ? `${item.id}:${item.version}`
        : `${item.id}:${item.version}:${timestamp}`;
    })
    .join(",");

export const signaturesDiffer = (current: string, next: string): boolean =>
  current !== next;

export type DashboardFreshnessInput = {
  total: number;
  tasks: readonly {
    id: string;
    entityVersion: number;
    updatedAt: string;
  }[];
};

/**
 * Dashboard signature: explicit global total + first-page task
 * identity. The total is a named field, not an undocumented prefix
 * trick, so a total-only change is a first-class difference.
 */
export const buildDashboardFreshnessSignature = (
  input: DashboardFreshnessInput,
): string => {
  const tasks = input.tasks
    .map((task) => `${task.id}:${task.entityVersion}:${task.updatedAt}`)
    .join(",");
  return `total:${input.total}|tasks:${tasks}`;
};

export type PausedListFreshnessInput = {
  total: number;
  conversations: readonly {
    customer: { id: number };
    lastMessage: { id: number } | null;
    control: { version: number } | null;
    activeOrder: {
      id: number;
      version: number;
      updatedAt?: string | null;
    } | null;
    needsAttention: boolean;
    attentionReason: string | null;
  }[];
};

/**
 * Paused queue signature: real global filtered total + first-page
 * conversation identity. Active orders are part of the conversation
 * signature because they affect both backend ordering and the visible
 * “Sipariş var” recognition signal.
 */
export const buildPausedListFreshnessSignature = (
  input: PausedListFreshnessInput,
): string => {
  const rows = input.conversations
    .map((row) => buildConversationListFreshnessSignature([row]))
    .join(",");
  return `total:${input.total}|rows:${rows}`;
};

export const buildConversationListFreshnessSignature = (
  conversations: readonly {
    customer: { id: number };
    lastMessage: { id: number } | null;
    control: { version: number } | null;
    activeOrder?: {
      id: number;
      version: number;
      updatedAt?: string | null;
    } | null;
    activeReturnIssue?: {
      id: number;
      version: number;
      updatedAt?: string | null;
    } | null;
    openUnanswered?: {
      id: number;
      version: number;
      lastSeenAt?: string | null;
    } | null;
    needsAttention: boolean;
    attentionReason: string | null;
  }[],
): string =>
  conversations
    .map((row) =>
      [
        row.customer.id,
        row.lastMessage?.id ?? 0,
        row.control?.version ?? 0,
        row.needsAttention ? 1 : 0,
        row.attentionReason ?? "",
        row.activeOrder === undefined
          ? "order:-"
          : row.activeOrder === null
            ? "order:0"
            : `order:${row.activeOrder.id}:${row.activeOrder.version}:${row.activeOrder.updatedAt ?? ""}`,
        row.activeReturnIssue === undefined
          ? "return:-"
          : row.activeReturnIssue === null
            ? "return:0"
            : `return:${row.activeReturnIssue.id}:${row.activeReturnIssue.version}:${row.activeReturnIssue.updatedAt ?? ""}`,
        row.openUnanswered === undefined
          ? "unanswered:-"
          : row.openUnanswered === null
            ? "unanswered:0"
            : `unanswered:${row.openUnanswered.id}:${row.openUnanswered.version}:${row.openUnanswered.lastSeenAt ?? ""}`,
      ].join(":"),
    )
    .join(",");
