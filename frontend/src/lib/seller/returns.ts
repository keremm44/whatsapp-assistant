/**
 * Seller “İade ve Sorunlar” — backend-derived contract layer.
 *
 * Contract module for the V1 returns/issues workspace at
 * /seller/returns. The backend endpoints in `protected_routes.py`
 * (list + detail + mark_handled + settings) with
 * `return_issue_service.py` are the single source of truth; the
 * frontend never reads tables directly and never invents lifecycle or
 * refund semantics around them.
 *
 * This module is deliberately dependency-free (types + parsers only,
 * zero runtime imports) so the contract can be verified with Node's
 * built-in test runner without a frontend test framework. Fetchers
 * live in `returns-api.ts`; presentation helpers in
 * `returns-format.ts`.
 *
 * Proven facts enforced by the parsers:
 *
 *   - Canonical request issue types / statuses / image requirements /
 *     views are the backend's exact allowlists (database.py constants
 *     and migrations 016 + 034). Unknown values are contract errors,
 *     never coerced into a "nearest" known state.
 *   - QUANTITY_LIMIT_REQUEST is a seller-review record in the same
 *     queue, but not a return-collection or photo-preference setting.
 *     Its structured quantity snapshot is parsed and cross-validated.
 *   - `customer_phone` is the service-enriched copy of
 *     customers.whatsapp_number (commit e8ff3f9) — nullable, rendered
 *     verbatim, no snapshot semantics.
 *   - List `toplam` is the RETURNED PAGE SIZE, not a global count:
 *     parsing only validates its shape; pagination logic must never
 *     treat it as a total (see returns-format.ts).
 *   - Detail `missing_fields` only ever contains the allowlisted
 *     order_number | reason | image. Unknown entries are contract
 *     errors, so the UI can never need invented copy.
 *   - Evidence carries only an internal message_id reference for the
 *     authenticated media proxy — never a URL.
 *   - `mark_handled` is the only seller action. The action response's
 *     `request` is the raw post-mutation row (no service display
 *     fields), so it parses through the core request parser.
 */

/* ------------------------------------------------------------------ */
/* Parse primitives (local, identical discipline to orders.ts)         */
/* ------------------------------------------------------------------ */

/** Parser-level error prefix; resolvers map it to `unavailable`. */
const RETURNS_CONTRACT_PREFIX = "returns_invalid_";

const contractError = (field: string): Error =>
  new Error(`${RETURNS_CONTRACT_PREFIX}${field}`);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readKey = (raw: Record<string, unknown>, key: string): unknown =>
  raw[key];

const readRequiredPositiveInteger = (
  raw: Record<string, unknown>,
  key: string,
): number => {
  const value = readKey(raw, key);
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw contractError(key);
  }
  return value;
};

const readRequiredNonNegativeInteger = (
  raw: Record<string, unknown>,
  key: string,
): number => {
  const value = readKey(raw, key);
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw contractError(key);
  }
  return value;
};

const readRequiredString = (
  raw: Record<string, unknown>,
  key: string,
): string => {
  const value = readKey(raw, key);
  if (typeof value !== "string") {
    throw contractError(key);
  }
  return value;
};

const readNullableString = (
  raw: Record<string, unknown>,
  key: string,
): string | null => {
  const value = readKey(raw, key);
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw contractError(key);
  }
  return value;
};

const readNullablePositiveInteger = (
  raw: Record<string, unknown>,
  key: string,
): number | null => {
  const value = readKey(raw, key);
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw contractError(key);
  }
  return value;
};

const readNullableNonNegativeInteger = (
  raw: Record<string, unknown>,
  key: string,
): number | null => {
  const value = readKey(raw, key);
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw contractError(key);
  }
  return value;
};

const readRequiredBoolean = (
  raw: Record<string, unknown>,
  key: string,
): boolean => {
  const value = readKey(raw, key);
  if (typeof value !== "boolean") {
    throw contractError(key);
  }
  return value;
};

const readLiteral = <T extends string>(
  raw: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T => {
  const value = readRequiredString(raw, key);
  if (!allowed.includes(value as T)) {
    throw contractError(key);
  }
  return value as T;
};

const readNullableLiteral = <T extends string>(
  raw: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | null => {
  const value = readKey(raw, key);
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw contractError(key);
  }
  return value as T;
};

/* ------------------------------------------------------------------ */
/* Allowlisted enums (backend-owned)                                   */
/* ------------------------------------------------------------------ */

/** protected_routes.seller_return_issue_requests view pattern. */
export const RETURN_VIEWS = [
  "action_required",
  "collecting",
  "handled",
  "all",
] as const;
export type ReturnView = (typeof RETURN_VIEWS)[number];

const isReturnView = (value: unknown): value is ReturnView =>
  typeof value === "string" &&
  (RETURN_VIEWS as readonly string[]).includes(value);

/** database.RETURN_ISSUE_TYPES / migrations 016 + 034 CHECKs. */
export const RETURN_ISSUE_TYPES = [
  "RETURN_REQUEST",
  "DAMAGED_ITEM",
  "WRONG_ITEM",
  "PRINT_OR_PERSONALIZATION_ISSUE",
  "DELIVERY_ISSUE",
  "OTHER_ORDER_ISSUE",
  "QUANTITY_LIMIT_REQUEST",
] as const;
export type ReturnIssueType = (typeof RETURN_ISSUE_TYPES)[number];

export const isReturnIssueType = (
  value: unknown,
): value is ReturnIssueType =>
  typeof value === "string" &&
  (RETURN_ISSUE_TYPES as readonly string[]).includes(value);

/**
 * Photo-preference settings remain limited to the six collection issue
 * types. Quantity reviews always snapshot NOT_REQUESTED in migration 034.
 */
export const RETURN_CONFIGURABLE_ISSUE_TYPES = [
  "RETURN_REQUEST",
  "DAMAGED_ITEM",
  "WRONG_ITEM",
  "PRINT_OR_PERSONALIZATION_ISSUE",
  "DELIVERY_ISSUE",
  "OTHER_ORDER_ISSUE",
] as const;
export type ReturnConfigurableIssueType =
  (typeof RETURN_CONFIGURABLE_ISSUE_TYPES)[number];

export const QUANTITY_LIMIT_DIRECTIONS = ["below_min", "above_max"] as const;
export type QuantityLimitDirection =
  (typeof QUANTITY_LIMIT_DIRECTIONS)[number];

/** database.VALID_RETURN_ISSUE_STATUSES / migration 016 CHECK. */
export const RETURN_STATUSES = [
  "COLLECTING",
  "SELLER_REVIEW_REQUIRED",
  "HANDLED",
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

/** database.RETURN_IMAGE_REQUIREMENTS / migration 016 CHECK. */
export const RETURN_IMAGE_REQUIREMENTS = [
  "REQUIRED",
  "OPTIONAL",
  "NOT_REQUESTED",
] as const;
export type ReturnImageRequirement =
  (typeof RETURN_IMAGE_REQUIREMENTS)[number];

/** return_issue_service._missing_fields allowlist. */
export const RETURN_MISSING_FIELDS = [
  "order_number",
  "reason",
  "image",
] as const;
export type ReturnMissingField = (typeof RETURN_MISSING_FIELDS)[number];

/* ------------------------------------------------------------------ */
/* Typed contract (camelCase)                                          */
/* ------------------------------------------------------------------ */

/**
 * Core request row (raw backend record, as returned by the action
 * response). Identity/user-facing keys only; internal message/profile
 * references are intentionally not parsed.
 */
export type ReturnRequestRecord = {
  id: number;
  customerId: number;
  orderId: number | null;
  issueType: ReturnIssueType;
  externalOrderNumberSnapshot: string | null;
  productNameSnapshot: string | null;
  /** Customer-provided text; rendered byte-exact, never rewritten. */
  reasonText: string | null;
  requestedQuantity: number | null;
  minQuantitySnapshot: number | null;
  maxQuantitySnapshot: number | null;
  quantityLimitDirection: QuantityLimitDirection | null;
  imageRequirementSnapshot: ReturnImageRequirement;
  status: ReturnStatus;
  reviewReasonCode: string | null;
  reviewNote: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  reviewRequiredAt: string | null;
  handledAt: string | null;
  sellerNote: string | null;
};

/** One list row: core record + service-derived presentation fields. */
export type ReturnRequestSummary = ReturnRequestRecord & {
  /** Backend-authoritative Turkish label; rendered verbatim. */
  displayIssueType: string;
  /** customers.whatsapp_number verbatim; null when unavailable. */
  customerPhone: string | null;
  sellerActionRequired: boolean;
};

export type ReturnListPage = {
  view: ReturnView;
  /** Returned-page length (`toplam`) — never a global total. */
  pageCount: number;
  limit: number;
  offset: number;
  requests: ReturnRequestSummary[];
};

export type ReturnCustomer = {
  id: number;
  whatsappNumber: string | null;
  name: string | null;
};

export type ReturnOrderRef = {
  id: number;
  externalOrderNumber: string | null;
  productNameSnapshot: string | null;
};

export type ReturnEvidenceItem = {
  id: number;
  /** Internal message reference for the media proxy — never a URL. */
  messageId: number;
  createdAt: string;
};

export type ReturnRequestDetail = {
  /** Core record + backend display fields (no customer_phone here). */
  request: ReturnRequestRecord & {
    displayIssueType: string;
    sellerActionRequired: boolean;
  };
  customer: ReturnCustomer | null;
  order: ReturnOrderRef | null;
  evidence: ReturnEvidenceItem[];
  /** More metadata can be fetched in bounded pages; images stay lazy. */
  evidenceHasMore: boolean;
  missingFields: ReturnMissingField[];
};

export type MarkReturnHandledResult = {
  action: "mark_handled";
  changed: boolean;
  request: ReturnRequestRecord;
};

export type ReturnIssueSetting = {
  issueType: ReturnConfigurableIssueType;
  /** Backend display_name (`ISSUE_TYPE_DISPLAY_NAMES`); verbatim. */
  displayName: string;
  imageRequirement: ReturnImageRequirement;
  version: number;
  updatedAt: string | null;
};

/* ------------------------------------------------------------------ */
/* Parsers                                                             */
/* ------------------------------------------------------------------ */

const validateQuantityMetadata = (record: ReturnRequestRecord): void => {
  const hasQuantityMetadata =
    record.requestedQuantity !== null ||
    record.minQuantitySnapshot !== null ||
    record.maxQuantitySnapshot !== null ||
    record.quantityLimitDirection !== null;

  if (record.issueType !== "QUANTITY_LIMIT_REQUEST") {
    if (hasQuantityMetadata) throw contractError("quantity_metadata");
    return;
  }

  if (
    record.requestedQuantity === null ||
    record.minQuantitySnapshot === null ||
    record.quantityLimitDirection === null ||
    record.imageRequirementSnapshot !== "NOT_REQUESTED" ||
    record.status === "COLLECTING"
  ) {
    throw contractError("quantity_metadata");
  }

  if (
    record.maxQuantitySnapshot !== null &&
    record.maxQuantitySnapshot < record.minQuantitySnapshot
  ) {
    throw contractError("quantity_metadata");
  }

  if (
    record.quantityLimitDirection === "below_min" &&
    record.requestedQuantity >= record.minQuantitySnapshot
  ) {
    throw contractError("quantity_metadata");
  }

  if (
    record.quantityLimitDirection === "above_max" &&
    (record.maxQuantitySnapshot === null ||
      record.requestedQuantity <= record.maxQuantitySnapshot)
  ) {
    throw contractError("quantity_metadata");
  }
};

const parseReturnRequestRecord = (raw: unknown): ReturnRequestRecord => {
  if (!isPlainObject(raw)) throw contractError("request");
  const record: ReturnRequestRecord = {
    id: readRequiredPositiveInteger(raw, "id"),
    customerId: readRequiredPositiveInteger(raw, "customer_id"),
    orderId: readNullablePositiveInteger(raw, "order_id"),
    issueType: readLiteral(raw, "issue_type", RETURN_ISSUE_TYPES),
    externalOrderNumberSnapshot: readNullableString(
      raw,
      "external_order_number_snapshot",
    ),
    productNameSnapshot: readNullableString(raw, "product_name_snapshot"),
    reasonText: readNullableString(raw, "reason_text"),
    requestedQuantity: readNullableNonNegativeInteger(raw, "requested_quantity"),
    minQuantitySnapshot: readNullablePositiveInteger(raw, "min_quantity_snapshot"),
    maxQuantitySnapshot: readNullablePositiveInteger(raw, "max_quantity_snapshot"),
    quantityLimitDirection: readNullableLiteral(
      raw,
      "quantity_limit_direction",
      QUANTITY_LIMIT_DIRECTIONS,
    ),
    imageRequirementSnapshot: readLiteral(
      raw,
      "image_requirement_snapshot",
      RETURN_IMAGE_REQUIREMENTS,
    ),
    status: readLiteral(raw, "status", RETURN_STATUSES),
    reviewReasonCode: readNullableString(raw, "review_reason_code"),
    reviewNote: readNullableString(raw, "review_note"),
    version: readRequiredPositiveInteger(raw, "version"),
    createdAt: readRequiredString(raw, "created_at"),
    updatedAt: readRequiredString(raw, "updated_at"),
    reviewRequiredAt: readNullableString(raw, "review_required_at"),
    handledAt: readNullableString(raw, "handled_at"),
    sellerNote: readNullableString(raw, "seller_note"),
  };
  validateQuantityMetadata(record);
  return record;
};

const parseReturnRequestSummary = (raw: unknown): ReturnRequestSummary => {
  const record = parseReturnRequestRecord(raw);
  if (!isPlainObject(raw)) throw contractError("request");
  return {
    ...record,
    displayIssueType: readRequiredString(raw, "display_issue_type"),
    customerPhone: readNullableString(raw, "customer_phone"),
    sellerActionRequired: readRequiredBoolean(raw, "seller_action_required"),
  };
};

const parseReturnListPage = (raw: unknown): ReturnListPage => {
  if (!isPlainObject(raw)) throw contractError("response");
  const viewRaw = readKey(raw, "view");
  if (!isReturnView(viewRaw)) throw contractError("view");
  const limitRaw = readKey(raw, "limit");
  if (
    typeof limitRaw !== "number" ||
    !Number.isInteger(limitRaw) ||
    limitRaw < 1 ||
    limitRaw > 100
  ) {
    throw contractError("limit_shape");
  }
  const requestsRaw = readKey(raw, "requests");
  if (!Array.isArray(requestsRaw)) throw contractError("requests");
  return {
    view: viewRaw,
    // Shape-only validation: the value is the page length, never a
    // global total, and must not be consumed as one downstream.
    pageCount: readRequiredNonNegativeInteger(raw, "toplam"),
    limit: limitRaw,
    offset: readRequiredNonNegativeInteger(raw, "offset"),
    requests: requestsRaw.map(parseReturnRequestSummary),
  };
};

const parseReturnCustomer = (raw: unknown): ReturnCustomer | null => {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw)) throw contractError("customer");
  return {
    id: readRequiredPositiveInteger(raw, "id"),
    whatsappNumber: readNullableString(raw, "whatsapp_number"),
    name: readNullableString(raw, "name"),
  };
};

const parseReturnOrderRef = (raw: unknown): ReturnOrderRef | null => {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw)) throw contractError("order");
  return {
    id: readRequiredPositiveInteger(raw, "id"),
    externalOrderNumber: readNullableString(raw, "external_order_number"),
    productNameSnapshot: readNullableString(raw, "product_name_snapshot"),
  };
};

const parseReturnEvidenceItem = (raw: unknown): ReturnEvidenceItem => {
  if (!isPlainObject(raw)) throw contractError("evidence");
  return {
    id: readRequiredPositiveInteger(raw, "id"),
    messageId: readRequiredPositiveInteger(raw, "message_id"),
    createdAt: readRequiredString(raw, "created_at"),
  };
};

const parseReturnMissingFields = (raw: unknown): ReturnMissingField[] => {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) throw contractError("missing_fields");
  return raw.map((entry) => {
    if (
      typeof entry !== "string" ||
      !(RETURN_MISSING_FIELDS as readonly string[]).includes(entry)
    ) {
      throw contractError("missing_fields_entry");
    }
    return entry as ReturnMissingField;
  });
};

const parseReturnDetail = (raw: unknown): ReturnRequestDetail => {
  if (!isPlainObject(raw)) throw contractError("response");

  const requestRaw = readKey(raw, "request");
  if (!isPlainObject(requestRaw)) throw contractError("request");
  const request = parseReturnRequestRecord(requestRaw);

  const evidenceRaw = readKey(raw, "evidence");
  if (evidenceRaw !== null && evidenceRaw !== undefined && !Array.isArray(evidenceRaw)) {
    throw contractError("evidence");
  }

  return {
    request: {
      ...request,
      displayIssueType: readRequiredString(requestRaw, "display_issue_type"),
      sellerActionRequired: readRequiredBoolean(
        requestRaw,
        "seller_action_required",
      ),
    },
    customer: parseReturnCustomer(readKey(raw, "customer")),
    order: parseReturnOrderRef(readKey(raw, "order")),
    evidence: ((evidenceRaw ?? []) as unknown[]).map(parseReturnEvidenceItem),
    evidenceHasMore: readKey(raw, "evidence_has_more") === true,
    missingFields: parseReturnMissingFields(readKey(raw, "missing_fields")),
  };
};

const parseMarkReturnHandledResult = (
  raw: unknown,
): MarkReturnHandledResult => {
  if (!isPlainObject(raw)) throw contractError("response");
  const action = readLiteral(raw, "action", ["mark_handled"] as const);
  const changedRaw = readKey(raw, "changed");
  // The backend reports idempotent repeats as changed=false; any
  // non-strict-boolean shape is a contract failure.
  if (typeof changedRaw !== "boolean") throw contractError("changed");
  return {
    action,
    changed: changedRaw,
    request: parseReturnRequestRecord(readKey(raw, "request")),
  };
};

const parseReturnIssueSetting = (raw: unknown): ReturnIssueSetting => {
  if (!isPlainObject(raw)) throw contractError("setting");
  return {
    issueType: readLiteral(
      raw,
      "issue_type",
      RETURN_CONFIGURABLE_ISSUE_TYPES,
    ),
    displayName: readRequiredString(raw, "display_name"),
    imageRequirement: readLiteral(
      raw,
      "image_requirement",
      RETURN_IMAGE_REQUIREMENTS,
    ),
    version: readRequiredPositiveInteger(raw, "version"),
    updatedAt: readNullableString(raw, "updated_at"),
  };
};

const parseReturnIssueSettingsResponse = (
  raw: unknown,
): ReturnIssueSetting[] => {
  if (!isPlainObject(raw)) throw contractError("response");
  const settingsRaw = readKey(raw, "settings");
  if (!Array.isArray(settingsRaw)) throw contractError("settings");
  return settingsRaw.map(parseReturnIssueSetting);
};

const parseReturnIssueSettingUpdateResponse = (
  raw: unknown,
): { changed: boolean; setting: ReturnIssueSetting } => {
  if (!isPlainObject(raw)) throw contractError("response");
  const changedRaw = readKey(raw, "changed");
  if (typeof changedRaw !== "boolean") throw contractError("changed");
  return {
    changed: changedRaw,
    setting: parseReturnIssueSetting(readKey(raw, "setting")),
  };
};

/* ------------------------------------------------------------------ */
/* Parse entry points (used by returns-api.ts fetchers)                 */
/* ------------------------------------------------------------------ */

export const parseReturnListResponse = (raw: unknown): ReturnListPage =>
  parseReturnListPage(raw);

export const parseReturnDetailResponse = (
  raw: unknown,
): ReturnRequestDetail => parseReturnDetail(raw);

export const parseReturnEvidencePageResponse = (raw: unknown): { evidence: ReturnEvidenceItem[]; hasMore: boolean } => {
  if (!isPlainObject(raw) || !Array.isArray(readKey(raw, "evidence")) || typeof readKey(raw, "has_more") !== "boolean") {
    throw contractError("evidence_page");
  }
  return { evidence: (readKey(raw, "evidence") as unknown[]).map(parseReturnEvidenceItem), hasMore: readKey(raw, "has_more") as boolean };
};

export const parseMarkReturnHandledResponse = (
  raw: unknown,
): MarkReturnHandledResult => parseMarkReturnHandledResult(raw);

export const parseReturnIssueSettingsList = (
  raw: unknown,
): ReturnIssueSetting[] => parseReturnIssueSettingsResponse(raw);

export const parseReturnIssueSettingUpdate = (
  raw: unknown,
): { changed: boolean; setting: ReturnIssueSetting } =>
  parseReturnIssueSettingUpdateResponse(raw);

export const RETURNS_CONTRACT_ERROR_PREFIX = RETURNS_CONTRACT_PREFIX;
