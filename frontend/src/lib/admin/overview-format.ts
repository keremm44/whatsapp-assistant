export type AdminLatestAnnouncement = {
  total: number;
  latest: { title: string; targetCount: number; readCount: number } | null;
};

const PREFIX = "admin_overview_invalid_";

const contractError = (key: string): Error => new Error(`${PREFIX}${key}`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const read = (record: Record<string, unknown>, key: string): unknown => {
  if (!(key in record)) throw contractError(`${key}_missing`);
  return record[key];
};

const readNonNegativeInt = (record: Record<string, unknown>, key: string) => {
  const value = read(record, key);
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw contractError(`${key}_shape`);
  }
  return value;
};

const readString = (record: Record<string, unknown>, key: string): string => {
  const value = read(record, key);
  if (typeof value !== "string" || value.length === 0) {
    throw contractError(`${key}_shape`);
  }
  return value;
};

/** `/admin/applications` intentionally returns its legacy `toplam` field. */
export const parseAdminApplicationsTotal = (raw: unknown): { total: number } => {
  if (!isRecord(raw)) throw contractError("applications_envelope");
  return { total: readNonNegativeInt(raw, "toplam") };
};

export const parseAdminOverviewTotal = (
  raw: unknown,
  context: string,
): { total: number } => {
  if (!isRecord(raw)) throw contractError(`${context}_envelope`);
  return { total: readNonNegativeInt(raw, "total") };
};

export const parseAdminLatestAnnouncement = (
  raw: unknown,
): AdminLatestAnnouncement => {
  if (!isRecord(raw)) throw contractError("announcements_envelope");
  const total = readNonNegativeInt(raw, "total");
  const announcements = read(raw, "announcements");
  if (!Array.isArray(announcements)) {
    throw contractError("announcements_shape");
  }
  if (announcements.length === 0) return { total, latest: null };

  const latest = announcements[0];
  if (!isRecord(latest)) throw contractError("announcement_item");
  return {
    total,
    latest: {
      title: readString(latest, "title"),
      targetCount: readNonNegativeInt(latest, "target_count"),
      readCount: readNonNegativeInt(latest, "read_count"),
    },
  };
};
