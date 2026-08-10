/**
 * Authenticated lookup of the seller's action queue.
 *
 * This module is the dashboard-side analogue of `lib/seller/me.ts`. The
 * backend `GET /seller/dashboard/tasks` endpoint is the single source
 * of truth for the seller's work surface. The frontend never reads
 * `return_issue_requests`, `orders`, or `unanswered_question_groups`
 * directly and never infers task state from any other client-side
 * signal.
 *
 * Module is server-only because it depends on the authenticated API
 * wrapper, which is currently invoked from a Server Component
 * (`app/seller/page.tsx`). It does not import the Supabase clients.
 *
 * The contract is taken verbatim from
 * `backend/migrations/020_add_seller_panel_read_models.sql`
 * (`get_seller_dashboard_tasks` RPC) and the
 * `seller_panel_service.list_dashboard_tasks` projection. The
 * SQL function joins three sources (return/issue, order,
 * unanswered) into a single ordered action queue; ordering is
 * `priority_rank ASC, updated_at DESC, related_entity_id DESC`.
 *
 * Parser discipline:
 *   - The SQL read model always emits a fixed set of keys. A
 *     MISSING key is a malformed backend contract, NOT a
 *     silently-defaulted null.
 *   - The VALUE of a nullable key may be `null` (the SQL's CASE
 *     branch). The KEY must be present.
 *   - Numeric shapes are validated strictly: positive integers for
 *     IDs, non-negative integers for `total`/`offset`, integer
 *     1..100 for `limit`. Fractions, negatives, and zero IDs are
 *     rejected.
 *   - Cross-field invariants are validated against the known
 *     SQL mapping:
 *         return_review       -> high + return_issue_request
 *         order_review        -> high + order
 *         unanswered_question -> normal + unanswered_question_group
 *     A payload that violates this mapping is a contract error.
 */

import { apiFetchWithAccessToken } from "@/lib/api/authenticated";

/**
 * Parser-level error tag prefix. The bootstrap layer maps any error
 * whose message starts with this prefix to `state: "unavailable"`.
 */
const DASHBOARD_TASKS_CONTRACT_PREFIX = "dashboard_tasks_invalid_";

/**
 * The three supported task types, mirrored from the FastAPI route's
 * `pattern` query parameter and the SQL function's allowlist.
 */
export const DASHBOARD_TASK_TYPES = [
  "return_review",
  "order_review",
  "unanswered_question",
] as const;
export type DashboardTaskType = (typeof DASHBOARD_TASK_TYPES)[number];

/**
 * Backend-defined priority. The frontend maps this to the two
 * approved visual sections:
 *   - "high"   -> "Önce bunlar"
 *   - "normal" -> "Bugün bakılabilecekler"
 * The frontend never invents additional priority levels; an unknown
 * value is a contract error.
 */
const VALID_PRIORITIES = new Set<string>(["high", "normal"]);
export type DashboardTaskPriority = "high" | "normal";

/**
 * The `action_target` block routes the seller to the existing
 * backend-supported list surface. The frontend maps `kind` to an
 * existing seller route; we never construct detail routes from
 * IDs.
 */
const VALID_ACTION_KINDS = new Set<string>([
  "return_issue_request",
  "order",
  "unanswered_question_group",
]);
type DashboardActionKind =
  | "return_issue_request"
  | "order"
  | "unanswered_question_group";

/**
 * Known cross-field mapping enforced by the SQL read model. A
 * payload that violates this mapping (e.g. a `return_review` task
 * with `priority: "normal"`) is treated as a contract error — we
 * never repair or reinterpret the mapping in the frontend.
 */
const TASK_TYPE_TO_PRIORITY: Record<DashboardTaskType, DashboardTaskPriority> = {
  return_review: "high",
  order_review: "high",
  unanswered_question: "normal",
};

const TASK_TYPE_TO_ACTION_KIND: Record<DashboardTaskType, DashboardActionKind> = {
  return_review: "return_issue_request",
  order_review: "order",
  unanswered_question: "unanswered_question_group",
};

export type DashboardTaskCustomer = {
  id: number;
  name: string | null;
  whatsappNumber: string | null;
};

export type DashboardTaskActionTarget = {
  kind: DashboardActionKind;
  id: number;
  customerId: number | null;
};

export type DashboardTask = {
  id: string;
  type: DashboardTaskType;
  priority: DashboardTaskPriority;
  customer: DashboardTaskCustomer | null;
  title: string;
  summary: string | null;
  relatedEntityId: number | null;
  entityVersion: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  actionTarget: DashboardTaskActionTarget | null;
};

export type DashboardTasks = {
  total: number;
  limit: number;
  offset: number;
  type: DashboardTaskType | null;
  tasks: DashboardTask[];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isTaskType = (value: unknown): value is DashboardTaskType =>
  typeof value === "string" &&
  (DASHBOARD_TASK_TYPES as readonly string[]).includes(value);

const isPriority = (value: unknown): value is DashboardTaskPriority =>
  typeof value === "string" && VALID_PRIORITIES.has(value);

const isActionKind = (value: unknown): value is DashboardActionKind =>
  typeof value === "string" && VALID_ACTION_KINDS.has(value);

/**
 * Positive integer guard. Rejects `0`, negatives, fractions,
 * non-numbers, NaN, +/-Infinity. Used for backend IDs and
 * `entity_version`.
 */
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value > 0;

/**
 * Non-negative integer guard. Rejects negatives, fractions, non-
 * numbers, NaN, +/-Infinity. Used for `total` and `offset`.
 */
const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value >= 0;

/**
 * Strict "key must be present, value may be null or T". If the key
 * is missing we treat it as a contract error; if the value is the
 * wrong type we treat it as a contract error. Only `null` is
 * accepted as the "no value" alternative.
 */
const readKey = (
  obj: Record<string, unknown>,
  key: string,
): unknown => {
  if (!(key in obj)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}${key}_missing`);
  }
  return obj[key];
};

const readNullableString = (
  obj: Record<string, unknown>,
  key: string,
): string | null => {
  const v = readKey(obj, key);
  if (v === null) return null;
  if (typeof v !== "string") {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}${key}_type`);
  }
  return v;
};

const readNullablePositiveInteger = (
  obj: Record<string, unknown>,
  key: string,
): number | null => {
  const v = readKey(obj, key);
  if (v === null) return null;
  if (!isPositiveInteger(v)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}${key}_shape`);
  }
  return v;
};

const parseCustomer = (raw: unknown): DashboardTaskCustomer | null => {
  if (raw === null) return null;
  if (!isPlainObject(raw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}customer`);
  }
  const idRaw = readKey(raw, "id");
  if (!isPositiveInteger(idRaw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}customer_id_shape`);
  }
  // `name` and `whatsapp_number` are also guaranteed keys per the
  // SQL projection, but the user's strict-reasoning list explicitly
  // enumerates only `action_target.customer_id`. We still apply
  // the same strict reasoning here: the key must be present and
  // the value is either a string or null.
  const name = readNullableString(raw, "name");
  const whatsappNumber = readNullableString(raw, "whatsapp_number");
  return { id: idRaw, name, whatsappNumber };
};

const parseActionTarget = (
  raw: unknown,
): DashboardTaskActionTarget | null => {
  if (raw === null) return null;
  if (!isPlainObject(raw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}action_target`);
  }
  const kindRaw = readKey(raw, "kind");
  if (!isActionKind(kindRaw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}action_target_kind`);
  }
  const idRaw = readKey(raw, "id");
  if (!isPositiveInteger(idRaw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}action_target_id_shape`);
  }
  const customerId = readNullablePositiveInteger(raw, "customer_id");
  return { kind: kindRaw, id: idRaw, customerId };
};

const parseTask = (raw: unknown): DashboardTask => {
  if (!isPlainObject(raw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}task`);
  }

  // `id` is a backend-constructed composite "<type>:<related_entity_id>".
  // It is required and must be a non-empty string. We do not parse
  // the inner shape — the frontend treats it as opaque.
  const idRaw = readKey(raw, "id");
  if (typeof idRaw !== "string" || idRaw.length === 0) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}task_id_shape`);
  }

  // `type` is required and must be one of the three allowlisted
  // values.
  const typeRaw = readKey(raw, "type");
  if (!isTaskType(typeRaw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}task_type`);
  }

  // `priority` is required and must be one of "high" | "normal".
  // The frontend does NOT treat priority as an internal sort key:
  // it is the user-facing two-section categorization.
  const priorityRaw = readKey(raw, "priority");
  if (!isPriority(priorityRaw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}task_priority`);
  }

  // Cross-field invariant: the SQL read model defines a fixed
  // mapping between task type, priority, and action_target.kind.
  // A payload that violates this mapping is a contract error.
  if (TASK_TYPE_TO_PRIORITY[typeRaw] !== priorityRaw) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}task_priority_mismatch`);
  }

  // `title` is required and must be a string.
  const titleRaw = readKey(raw, "title");
  if (typeof titleRaw !== "string") {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}task_title_shape`);
  }

  // The remaining fields are nullable (string or null for
  // textual, positive int or null for IDs) but their KEYS must be
  // present per the SQL projection. A missing key is a contract
  // error; a wrong-typed value is a contract error.
  const summary = readNullableString(raw, "summary");
  const relatedEntityId = readNullablePositiveInteger(
    raw,
    "related_entity_id",
  );
  const entityVersion = readNullablePositiveInteger(raw, "entity_version");
  const createdAt = readNullableString(raw, "created_at");
  const updatedAt = readNullableString(raw, "updated_at");

  const customer = parseCustomer(readKey(raw, "customer"));
  const actionTarget = parseActionTarget(readKey(raw, "action_target"));

  // Cross-field invariant: action_target.kind must match the
  // task type. We check this after the action_target object is
  // fully parsed so the error points at the right field.
  if (
    actionTarget !== null &&
    TASK_TYPE_TO_ACTION_KIND[typeRaw] !== actionTarget.kind
  ) {
    throw new Error(
      `${DASHBOARD_TASKS_CONTRACT_PREFIX}action_target_kind_mismatch`,
    );
  }

  return {
    id: idRaw,
    type: typeRaw,
    priority: priorityRaw,
    customer,
    title: titleRaw,
    summary,
    relatedEntityId,
    entityVersion,
    createdAt,
    updatedAt,
    actionTarget,
  };
};

const parseDashboardTasks = (raw: unknown): DashboardTasks => {
  if (!isPlainObject(raw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}response`);
  }

  // `toplam` is the total count of filtered tasks (NOT just the
  // page size). It is a non-negative integer.
  const totalRaw = readKey(raw, "toplam");
  if (!isNonNegativeInteger(totalRaw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}total_shape`);
  }

  // `limit` is the page size. The SQL function accepts 1..100;
  // the FastAPI route enforces the same range. We mirror the
  // range here so a backend regression is caught immediately.
  const limitRaw = readKey(raw, "limit");
  if (
    !isNonNegativeInteger(limitRaw) ||
    !Number.isInteger(limitRaw) ||
    limitRaw < 1 ||
    limitRaw > 100
  ) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}limit_shape`);
  }

  // `offset` is the page offset. Non-negative integer.
  const offsetRaw = readKey(raw, "offset");
  if (!isNonNegativeInteger(offsetRaw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}offset_shape`);
  }

  // `type` is the request filter, echoed back. Always present
  // (null when no filter was provided).
  const typeRaw = readKey(raw, "type");
  if (typeRaw === null) {
    // valid: no filter
  } else if (!isTaskType(typeRaw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}type`);
  }
  const type: DashboardTaskType | null = isTaskType(typeRaw) ? typeRaw : null;

  if (!Array.isArray(raw.tasks)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}tasks`);
  }

  const tasks: DashboardTask[] = [];
  for (const rawTask of raw.tasks) {
    tasks.push(parseTask(rawTask));
  }

  return {
    total: totalRaw,
    limit: limitRaw,
    offset: offsetRaw,
    type,
    tasks,
  };
};

export type FetchDashboardTasksOptions = {
  signal?: AbortSignal;
  /**
   * Optional filter by task type. Mirrors the FastAPI route's
   * `?type=` query parameter and the SQL function's allowlist.
   */
  type?: DashboardTaskType;
  cache?: RequestCache;
};

/**
 * Fetch and parse `GET /seller/dashboard/tasks`. The caller must
 * already hold a valid Supabase access token. The token is forwarded
 * as a Bearer.
 */
export const fetchDashboardTasks = async (
  accessToken: string,
  options?: FetchDashboardTasksOptions,
): Promise<DashboardTasks> => {
  const query: Record<string, string> = {
    limit: "50",
    offset: "0",
  };
  if (options?.type) {
    query.type = options.type;
  }
  const qs = new URLSearchParams(query).toString();
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/dashboard/tasks?${qs}`,
    accessToken,
    {
      signal: options?.signal,
      cache: options?.cache ?? "no-store",
    },
  );
  return parseDashboardTasks(raw);
};

export const DASHBOARD_TASKS_CONTRACT_ERROR_PREFIX = DASHBOARD_TASKS_CONTRACT_PREFIX;
