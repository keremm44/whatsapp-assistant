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
 * Backend-defined priority. Used internally for sort ranking. The
 * frontend never invents additional priority levels; an unknown
 * value is treated as a contract violation.
 */
const VALID_PRIORITIES = new Set<string>(["high", "normal"]);
type DashboardTaskPriority = "high" | "normal";

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

const isActionKind = (
  value: unknown,
): value is DashboardActionKind =>
  typeof value === "string" && VALID_ACTION_KINDS.has(value);

const parseCustomer = (raw: unknown): DashboardTaskCustomer | null => {
  if (raw === null) return null;
  if (!isPlainObject(raw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}customer`);
  }
  const idRaw = raw.id;
  const id =
    typeof idRaw === "number" && Number.isFinite(idRaw) ? idRaw : null;
  if (id === null) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}customer_id`);
  }
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : null,
    whatsappNumber:
      typeof raw.whatsapp_number === "string"
        ? raw.whatsapp_number
        : null,
  };
};

const parseActionTarget = (
  raw: unknown,
): DashboardTaskActionTarget | null => {
  if (raw === null) return null;
  if (!isPlainObject(raw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}action_target`);
  }
  if (!isActionKind(raw.kind)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}action_target_kind`);
  }
  const idRaw = raw.id;
  const id =
    typeof idRaw === "number" && Number.isFinite(idRaw) ? idRaw : null;
  if (id === null) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}action_target_id`);
  }
  const customerIdRaw = raw.customer_id;
  const customerId =
    customerIdRaw === null || customerIdRaw === undefined
      ? null
      : typeof customerIdRaw === "number" && Number.isFinite(customerIdRaw)
        ? customerIdRaw
        : (() => {
            throw new Error(
              `${DASHBOARD_TASKS_CONTRACT_PREFIX}action_target_customer_id`,
            );
          })();
  return { kind: raw.kind, id, customerId };
};

const parseTask = (raw: unknown): DashboardTask => {
  if (!isPlainObject(raw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}task`);
  }
  // id is a backend-constructed composite "<type>:<related_entity_id>";
  // we treat it as opaque to the frontend and only verify shape.
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}task_id`);
  }
  if (!isTaskType(raw.type)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}task_type`);
  }
  if (!isPriority(raw.priority)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}task_priority`);
  }
  if (typeof raw.title !== "string") {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}task_title`);
  }

  const summary =
    raw.summary === null || raw.summary === undefined
      ? null
      : typeof raw.summary === "string"
        ? raw.summary
        : (() => {
            throw new Error(
              `${DASHBOARD_TASKS_CONTRACT_PREFIX}task_summary`,
            );
          })();

  const relatedEntityId =
    raw.related_entity_id === null || raw.related_entity_id === undefined
      ? null
      : typeof raw.related_entity_id === "number" &&
          Number.isFinite(raw.related_entity_id)
        ? raw.related_entity_id
        : (() => {
            throw new Error(
              `${DASHBOARD_TASKS_CONTRACT_PREFIX}task_related_entity_id`,
            );
          })();

  const entityVersion =
    raw.entity_version === null || raw.entity_version === undefined
      ? null
      : typeof raw.entity_version === "number" &&
          Number.isFinite(raw.entity_version)
        ? raw.entity_version
        : (() => {
            throw new Error(
              `${DASHBOARD_TASKS_CONTRACT_PREFIX}task_entity_version`,
            );
          })();

  const createdAt =
    raw.created_at === null || raw.created_at === undefined
      ? null
      : typeof raw.created_at === "string"
        ? raw.created_at
        : (() => {
            throw new Error(
              `${DASHBOARD_TASKS_CONTRACT_PREFIX}task_created_at`,
            );
          })();

  const updatedAt =
    raw.updated_at === null || raw.updated_at === undefined
      ? null
      : typeof raw.updated_at === "string"
        ? raw.updated_at
        : (() => {
            throw new Error(
              `${DASHBOARD_TASKS_CONTRACT_PREFIX}task_updated_at`,
            );
          })();

  return {
    id: raw.id,
    type: raw.type,
    priority: raw.priority,
    customer: parseCustomer(raw.customer),
    title: raw.title,
    summary,
    relatedEntityId,
    entityVersion,
    createdAt,
    updatedAt,
    actionTarget: parseActionTarget(raw.action_target),
  };
};

const parseDashboardTasks = (raw: unknown): DashboardTasks => {
  if (!isPlainObject(raw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}response`);
  }

  const totalRaw = raw.toplam;
  if (typeof totalRaw !== "number" || !Number.isFinite(totalRaw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}total`);
  }

  const limitRaw = raw.limit;
  if (typeof limitRaw !== "number" || !Number.isFinite(limitRaw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}limit`);
  }

  const offsetRaw = raw.offset;
  if (typeof offsetRaw !== "number" || !Number.isFinite(offsetRaw)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}offset`);
  }

  const type =
    raw.type === null || raw.type === undefined
      ? null
      : isTaskType(raw.type)
        ? raw.type
        : (() => {
            throw new Error(
              `${DASHBOARD_TASKS_CONTRACT_PREFIX}type`,
            );
          })();

  if (!Array.isArray(raw.tasks)) {
    throw new Error(`${DASHBOARD_TASKS_CONTRACT_PREFIX}tasks`);
  }

  const tasks: DashboardTask[] = [];
  for (const rawTask of raw.tasks) {
    tasks.push(parseTask(rawTask));
  }

  return { total: totalRaw, limit: limitRaw, offset: offsetRaw, type, tasks };
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
