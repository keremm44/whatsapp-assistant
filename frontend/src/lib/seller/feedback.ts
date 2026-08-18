export const SELLER_FEEDBACK_CATEGORIES = [
  "suggestion",
  "problem",
  "complaint",
  "other",
] as const;

export type SellerFeedbackCategory = (typeof SELLER_FEEDBACK_CATEGORIES)[number];
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

const CATEGORY_SET = new Set<string>(SELLER_FEEDBACK_CATEGORIES);
const STATUS_SET = new Set<string>(["OPEN", "IN_REVIEW", "RESOLVED"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPositiveInt = (value: unknown): value is number =>
  Number.isInteger(value) && typeof value === "number" && value > 0;

const isNonNegativeInt = (value: unknown): value is number =>
  Number.isInteger(value) && typeof value === "number" && value >= 0;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const parseFeedback = (value: unknown): SellerFeedback => {
  if (!isRecord(value)) throw new Error("feedback_invalid_item");

  const {
    id,
    category,
    subject,
    message,
    status,
    version,
    created_at: createdAt,
    updated_at: updatedAt,
    resolved_at: resolvedAt,
  } = value;

  if (
    !isPositiveInt(id) ||
    typeof category !== "string" ||
    !CATEGORY_SET.has(category) ||
    !isNonEmptyString(subject) ||
    !isNonEmptyString(message) ||
    typeof status !== "string" ||
    !STATUS_SET.has(status) ||
    !isPositiveInt(version) ||
    !isNonEmptyString(createdAt) ||
    !isNonEmptyString(updatedAt) ||
    (resolvedAt !== null && !isNonEmptyString(resolvedAt)) ||
    ((status === "RESOLVED") !== (resolvedAt !== null))
  ) {
    throw new Error("feedback_invalid_item");
  }

  return {
    id,
    category: category as SellerFeedbackCategory,
    subject,
    message,
    status: status as SellerFeedbackStatus,
    version,
    createdAt,
    updatedAt,
    resolvedAt,
  };
};

export const parseSellerFeedbackCreateResponse = (value: unknown): SellerFeedback => {
  if (!isRecord(value)) throw new Error("feedback_invalid_create_response");
  return parseFeedback(value.feedback);
};

export const parseSellerFeedbackListResponse = (value: unknown): SellerFeedbackListPage => {
  if (!isRecord(value)) throw new Error("feedback_invalid_list_response");
  const { total, limit, offset, feedback } = value;
  if (
    !isNonNegativeInt(total) ||
    !isPositiveInt(limit) ||
    !isNonNegativeInt(offset) ||
    !Array.isArray(feedback)
  ) {
    throw new Error("feedback_invalid_list_response");
  }

  return {
    total,
    limit,
    offset,
    feedback: feedback.map(parseFeedback),
  };
};

export const feedbackCategoryLabel = (category: SellerFeedbackCategory): string =>
  ({
    suggestion: "Öneri",
    problem: "Sorun",
    complaint: "Şikayet",
    other: "Diğer",
  })[category];

export const feedbackStatusLabel = (status: SellerFeedbackStatus): string =>
  ({
    OPEN: "Gönderildi",
    IN_REVIEW: "İnceleniyor",
    RESOLVED: "Çözüldü",
  })[status];

export const formatFeedbackDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};
