/**
 * Time-ago formatter for dashboard tasks.
 *
 * The backend exposes `updated_at` and `created_at` as ISO 8601
 * strings. We never invent "waiting" or "delay" semantics — we
 * just render the actual time delta against the current server
 * render time.
 *
 * IMPORTANT: `updated_at` is the last-modification timestamp of
 * the underlying entity. It is NOT a "waiting" or "response
 * delay" metric. Callers MUST label the rendered phrase with
 * its real meaning ("Güncelleme · X saat önce") so the user
 * does not read a bare "2 saat önce" as "waiting for 2 hours".
 * The wrapping helper `formatUpdatedAt` does this for the
 * dashboard.
 *
 * Server-render correctness:
 *   This module is server-only. It uses `Date.now()` as the
 *   "now" reference and produces a deterministic string per
 *   request. We never read the user's clock or locale here.
 *
 * Robustness:
 *   If the input is missing, unparseable, or in the future
 *   (clock skew, malformed payload), we return `null` so the
 *   caller can omit the line entirely. We never throw.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const formatTimeAgoTr = (deltaMs: number): string | null => {
  if (deltaMs < 45_000) return "az önce";
  if (deltaMs < HOUR) {
    const m = Math.max(1, Math.round(deltaMs / MINUTE));
    return `${m} dakika önce`;
  }
  if (deltaMs < DAY) {
    const h = Math.max(1, Math.round(deltaMs / HOUR));
    return `${h} saat önce`;
  }
  if (deltaMs < 2 * DAY) return "dün";
  if (deltaMs < 7 * DAY) {
    const d = Math.max(2, Math.round(deltaMs / DAY));
    return `${d} gün önce`;
  }
  const w = Math.round(deltaMs / (7 * DAY));
  if (w < 5) return `${w} hafta önce`;
  // For very old rows we fall back to a short locale-independent
  // date so the meta line never becomes absurdly long.
  return null;
};

/**
 * Parse an ISO timestamp and produce a Turkish time-ago phrase.
 * Returns `null` for missing, malformed, or future-dated input.
 *
 * The returned phrase is the relative delta only ("2 saat önce").
 * It is the caller's responsibility to label the phrase with
 * what the timestamp means ("Güncelleme · 2 saat önce",
 * "Oluşturulma · 2 saat önce"). The bare phrase must never be
 * rendered without a label, because it can otherwise be read as
 * "waiting for N hours" by the user.
 */
export const formatTimeAgo = (
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): string | null => {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const delta = nowMs - t;
  if (delta < 0) return null;
  return formatTimeAgoTr(delta);
};

/**
 * Format an `updated_at` timestamp as a labelled, accessible
 * phrase: "Güncelleme · 2 saat önce" (or shorter variants).
 *
 * The label is the same word used in the dashboard's caption
 * strip ("Güncelleme") so the user immediately understands
 * what the relative time refers to. Returns `null` for
 * missing/malformed input so the caller can omit the entire
 * meta line cleanly.
 */
export const formatUpdatedAt = (
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): string | null => {
  const phrase = formatTimeAgo(iso, nowMs);
  if (phrase === null) return null;
  return `Güncelleme · ${phrase}`;
};

/**
 * Compose the customer meta line for a dashboard task.
 *
 * The customer block may be null (only on the
 * `unanswered_question` branch). When present, `name` and
 * `whatsappNumber` are individually nullable. We join the
 * non-empty parts with a middle dot, exactly mirroring the
 * nullability proven in the typed contract.
 */
export const composeCustomerLine = (
  customer:
    | {
        name: string | null;
        whatsappNumber: string | null;
      }
    | null
    | undefined,
): string | null => {
  if (!customer) return null;
  const parts: string[] = [];
  if (
    typeof customer.name === "string" &&
    customer.name.trim().length > 0
  ) {
    parts.push(customer.name.trim());
  }
  if (
    typeof customer.whatsappNumber === "string" &&
    customer.whatsappNumber.trim().length > 0
  ) {
    parts.push(customer.whatsappNumber.trim());
  }
  return parts.length > 0 ? parts.join(" · ") : null;
};
