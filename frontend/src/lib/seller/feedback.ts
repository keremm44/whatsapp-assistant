/**
 * Seller Feedback — strict frontend contract for the existing backend API.
 *
 * The backend owns tenant scope and workflow status. Seller-facing code never
 * exposes admin_note or allows the browser to mutate status/version fields.
 */

export type SellerFeedbackCategory =
  | "suggestion"
  | "problem"
  | "complaint"
  | "other";

export type SellerFeedbackStatus = "OPEN" | "IN_REVIEW" | "RESOLVED";

export type SellerFeedback = {
  id: number;
  category: SellerFeedbackCategory;
  subject: string;
  message: string;
  status: SellerFeedbackStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type SellerFeedbackListPage = {
  total: number;
  limit: number;
  offset: number;
  feedback: SellerFeedback[];
};

export type SellerFeedbackCreatePayload = {
  category: SellerFeedbackCategory;
  subject: string;
  message: string;
};

export const FEEDBACK_SUBJECT_MAX_LENGTH = 200;
export const FEEDBACK_MESSAGE_MAX_LENGTH = 4000;

export const FEEDBACK_CATEGORY_LABELS: Record<SellerFeedbackCategory, string> = {
  suggestion: "Öneri",
  problem: "Sorun",
  complaint: "Şikayet",
  other: "Diğer",
};

export const FEEDBACK_STATUS_LABELS: Record<SellerFeedbackStatus, string> = {
  OPEN: "Gönderildi",
  IN_REVIEW: "İnceleniyor",
  RESOLVED: "Çözüldü",
};

const CONTRACT_PREFIX = "feedback_invalid_";

const contractError = (tag: string): Error =>
  new Error(`${CONTRACT_PREFIX}${tag}`);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const read = (obj: Record<string, unknown>, key: string): unknown => {
  if (!(key in obj)) throw contractError(`${key}_missing`);
  return obj[key];
};

const readPositiveInt = (obj: Record<string, unknown>, key: string): number => {
  const value = read(obj, key);
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw contractError(`${key}_shape`);
  }
  return value;
};

const readNonNegativeInt = (
  obj: Record<string, unknown>,
  key: string,
): number => {
  const value = read(obj, key);
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

const readNonEmptyString = (
  obj: Record<string, unknown>,
  key: string,
): string => {
  const value = read(obj, key);
  if (typeof value !== "string" || value.length === 0) {
    throw contractError(`${key}_shape`);
  }
  return value;
};

const readNullableString = (
  obj: Record<string, unknown>,
  key: string,
): string | null => {
  const value = read(obj, key);
  if (value === null) return null;
  if (typeof value !== "string" || value.length === 0) {
    throw contractError(`${key}_shape`);
  }
  return value;
};

const parseCategory = (value: unknown): SellerFeedbackCategory => {
  if (
    value !== "suggestion" &&
    value !== "problem" &&
    value !== "complaint" &&
    value !== "other"
  ) {
    throw contractError("category");
  }
  return value;
};

const parseStatus = (value: unknown): SellerFeedbackStatus => {
  if (value !== "OPEN" && value !== "IN_REVIEW" && value !== "RESOLVED") {
    throw contractError("status");
  }
  return value;
};

export const parseSellerFeedback = (raw: unknown): SellerFeedback => {
  if (!isObject(raw)) throw contractError("item");

  const status = parseStatus(read(raw, "status"));
  const resolvedAt = readNullableString(raw, "resolved_at");
  if ((status === "RESOLVED") !== (resolvedAt !== null)) {
    throw contractError("resolved_state_mismatch");
  }

  const subject = readNonEmptyString(raw, "subject");
  const message = readNonEmptyString(raw, "message");
  if (subject.length > FEEDBACK_SUBJECT_MAX_LENGTH) {
    throw contractError("subject_length");
  }
  if (message.length > FEEDBACK_MESSAGE_MAX_LENGTH) {
    throw contractError("message_length");
  }

  return {
    id: readPositiveInt(raw, "id"),
    category: parseCategory(read(raw, "category")),
    subject,
    message,
    status,
    version: readPositiveInt(raw, "version"),
    createdAt: readNonEmptyString(raw, "created_at"),
    updatedAt: readNonEmptyString(raw, "updated_at"),
    resolvedAt,
  };
};

export const parseSellerFeedbackListResponse = (
  raw: unknown,
): SellerFeedbackListPage => {
  if (!isObject(raw)) throw contractError("list");

  const total = readNonNegativeInt(raw, "total");
  const limit = readPositiveInt(raw, "limit");
  const offset = readNonNegativeInt(raw, "offset");
  if (limit > 100) throw contractError("limit_range");

  const rows = read(raw, "feedback");
  if (!Array.isArray(rows)) throw contractError("feedback_shape");
  if (rows.length > limit) throw contractError("feedback_limit");
  if (offset + rows.length > total && rows.length > 0) {
    throw contractError("pagination_total_mismatch");
  }

  return {
    total,
    limit,
    offset,
    feedback: rows.map(parseSellerFeedback),
  };
};

export const parseSellerFeedbackItemResponse = (raw: unknown): SellerFeedback => {
  if (!isObject(raw)) throw contractError("response");
  return parseSellerFeedback(read(raw, "feedback"));
};

export const normalizeSellerFeedbackCreatePayload = (
  payload: SellerFeedbackCreatePayload,
): SellerFeedbackCreatePayload => ({
  category: payload.category,
  subject: payload.subject.trim(),
  message: payload.message.trim(),
});

export const validateSellerFeedbackCreatePayload = (
  payload: SellerFeedbackCreatePayload,
): { subject?: string; message?: string } => {
  const normalized = normalizeSellerFeedbackCreatePayload(payload);
  const errors: { subject?: string; message?: string } = {};

  if (normalized.subject.length === 0) {
    errors.subject = "Konu zorunludur.";
  } else if (normalized.subject.length > FEEDBACK_SUBJECT_MAX_LENGTH) {
    errors.subject = `Konu en fazla ${FEEDBACK_SUBJECT_MAX_LENGTH} karakter olabilir.`;
  }

  if (normalized.message.length === 0) {
    errors.message = "Mesaj zorunludur.";
  } else if (normalized.message.length > FEEDBACK_MESSAGE_MAX_LENGTH) {
    errors.message = `Mesaj en fazla ${FEEDBACK_MESSAGE_MAX_LENGTH} karakter olabilir.`;
  }

  return errors;
};

export const formatFeedbackDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};
