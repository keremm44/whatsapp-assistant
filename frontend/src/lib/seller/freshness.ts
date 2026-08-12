/**
 * Conservative V1 freshness signatures for seller work surfaces.
 *
 * Background checks compare a small, stable first-page identity
 * (ids + versions, or the proven attention/control identity for
 * conversations). They never invent a count of new records and never
 * claim what changed — only that the current first page no longer
 * matches the page the seller is looking at.
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

export const buildDashboardFreshnessSignature = (
  tasks: readonly {
    id: string;
    entityVersion: number;
    updatedAt: string;
  }[],
): string =>
  tasks
    .map((task) => `${task.id}:${task.entityVersion}:${task.updatedAt}`)
    .join(",");

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
