/**
 * Conservative V1 freshness signatures for seller work surfaces.
 *
 * Background checks compare a small, stable first-page identity
 * (ids + versions, or the proven attention/control identity for
 * conversations). They never invent a count of new records and never
 * claim what changed — only that the current first page no longer
 * matches the page the seller is looking at.
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

export const buildIdVersionSignature = (
  items: readonly { id: number; version: number }[],
): string => items.map((item) => `${item.id}:${item.version}`).join(",");

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
    activeOrder: { id: number; version: number } | null;
    needsAttention: boolean;
    attentionReason: string | null;
  }[];
};

/**
 * Paused queue signature: real global filtered total + first-page
 * conversation identity + active-order identity. Active orders affect
 * both backend ordering and the visible “Sipariş var” recognition
 * signal, so an order appearing/disappearing must surface Yenile even
 * if the message/control identity is unchanged.
 */
export const buildPausedListFreshnessSignature = (
  input: PausedListFreshnessInput,
): string => {
  const rows = input.conversations
    .map((row) => {
      const base = buildConversationListFreshnessSignature([row]);
      return `${base}:${row.activeOrder?.id ?? 0}:${row.activeOrder?.version ?? 0}`;
    })
    .join(",");
  return `total:${input.total}|rows:${rows}`;
};

export const buildConversationListFreshnessSignature = (
  conversations: readonly {
    customer: { id: number };
    lastMessage: { id: number } | null;
    control: { version: number } | null;
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
      ].join(":"),
    )
    .join(",");
