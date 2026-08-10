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
 * Proven nullability (per the SQL read model and the underlying
 * tables; every claim is documented inline):
 *
 *   id, type, priority, title, summary,
 *   related_entity_id, entity_version, created_at, updated_at,
 *   action_target, action_target.kind, action_target.id
 *     -> ALWAYS present, never null
 *
 *   customer, action_target.customer_id
 *     -> key ALWAYS present; value MAY be null
 *
 *   customer.id, customer.name, customer.whatsapp_number
 *     -> key ALWAYS present when customer is non-null;
 *        value MAY be null (per the underlying customers columns)
 *
 *   The outer `customer` field is null only on the
 *   `unanswered_question` branch (which uses LEFT JOIN); the
 *   `return_review` and `order_review` branches INNER JOIN
 *   customers, so customer is non-null there. This is enforced as
 *   a cross-field invariant in the parser.
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

/**
 * Which task types are guaranteed to carry a non-null customer by
 * the SQL's join structure. `return_review` and `order_review` use
 * INNER JOIN; `unanswered_question` uses LEFT JOIN.
 */
const TASK_TYPE_WITH_REQUIRED_CUSTOMER: Record<DashboardTaskType, boolean> = {
  return_review: true,
  order_review: true,
  unanswered_question: false,
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

/**
 * Common fields shared by every task shape. Proven-always-present,
 * non-null values use the non-nullable TS type. Nullable-by-SQL
 * values use `T | null`.
 */
type DashboardTaskBase = {
  id: string;
  type: DashboardTaskType;
  priority: DashboardTaskPriority;
  title: string;
  summary: string;
  relatedEntityId: number;
  entityVersion: number;
  createdAt: string;
  updatedAt: string;
  actionTarget: DashboardTaskActionTarget;
};

/**
 * Discriminated union of task shapes, split by whether the SQL's
 * join guarantees a customer row.
 *
 *   return_review       -> customer is non-null
 *   order_review        -> customer is non-null
 *   unanswered_question -> customer may be null
 *
 * The dashboard page iterates these uniformly; the union exists so
 * the page (or any future consumer) can narrow on `type` and rely on
 * the customer nullability being correct.
 */
export type DashboardTask =
  | (DashboardTaskBase & {
      type: "return_review" | "order_review";
      customer: DashboardTaskCustomer;
    })
  | (DashboardTaskBase & {
      type: "unanswered_question";
      customer: DashboardTaskCustomer | null;
    });

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
const readKey = (obj: Record<string, unknown>, key: string): unknown => {
  if (!(key in obj)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}${key}_missing`);
  }
  return obj[key];
};

const readRequiredString = (
  obj: Record<string, unknown>,
  key: string,
): string => {
  const v = readKey(obj, key);
  if (typeof v !== "string") {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}${key}_type`);
  }
  return v;
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

const readRequiredPositiveInteger = (
  obj: Record<string, unknown>,
  key: string,
): number => {
  const v = readKey(obj, key);
  if (!isPositiveInteger(v)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}${key}_shape`);
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

const parseCustomer = (raw: unknown): DashboardTaskCustomer => {
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

const parseActionTarget = (raw: unknown): DashboardTaskActionTarget => {
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
  // `customer_id` is the only field that may be null. The key must
  // be present per the SQL projection.
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
    throw new Error(
      `${DASHBOARD_TASKS_CONTRACT_PREFIX}task_priority_mismatch`,
    );
  }

  // `title`, `summary`, `related_entity_id`, `entity_version`,
  // `created_at`, `updated_at`, `action_target` are ALL proven
  // non-null in the SQL projection (see file header). The
  // customer / action_target.customer_id fields are the only
  // nullable ones; see the task-type-specific branches below.
  const title = readRequiredString(raw, "title");
  const summary = readRequiredString(raw, "summary");
  const relatedEntityId = readRequiredPositiveInteger(
    raw,
    "related_entity_id",
  );
  const entityVersion = readRequiredPositiveInteger(raw, "entity_version");
  const createdAt = readRequiredString(raw, "created_at");
  const updatedAt = readRequiredString(raw, "updated_at");
  const actionTarget = parseActionTarget(readKey(raw, "action_target"));

  // Cross-field invariant: action_target.kind must match the
  // task type. We check this after the action_target object is
  // fully parsed so the error points at the right field.
  if (TASK_TYPE_TO_ACTION_KIND[typeRaw] !== actionTarget.kind) {
    throw new Error(
      `${DASHBOARD_TASKS_CONTRACT_PREFIX}action_target_kind_mismatch`,
    );
  }

  // Cross-field invariant: customer is required for
  // `return_review` and `order_review` (the SQL's INNER JOIN
  // guarantees a non-null customer). `unanswered_question` allows
  // null. We enforce the requirement before constructing the
  // discriminated union so the impossible combination can never
  // be represented.
  const customerRaw = readKey(raw, "customer");
  if (customerRaw === null && TASK_TYPE_WITH_REQUIRED_CUSTOMER[typeRaw]) {
    throw new Error(
      `${DASHBOARD_TASKS_CONTRACT_PREFIX}customer_required`,
    );
  }

  // Build the common base. All fields here are proven non-null in
  // the SQL projection. We set `type: typeRaw` (widened) here; the
  // discriminator is set per-branch below.
  const base: Omit<DashboardTaskBase, "type"> = {
    id: idRaw,
    priority: priorityRaw,
    title,
    summary,
    relatedEntityId,
    entityVersion,
    createdAt,
    updatedAt,
    actionTarget,
  };

  // `customer` is the only field that may be null. The
  // discriminated union maps the proven SQL nullability onto the
  // TypeScript type: `unanswered_question` may have a null
  // customer; the other two branches never do.
  if (customerRaw === null) {
    return {
      ...base,
      type: "unanswered_question",
      customer: null,
    };
  }
  return {
    ...base,
    type: typeRaw,
    customer: parseCustomer(customerRaw),
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
