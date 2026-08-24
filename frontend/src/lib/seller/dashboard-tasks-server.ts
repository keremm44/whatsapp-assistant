/**
 * Server-side seller dashboard task resolver.
 *
 * This module is the dashboard-side companion of
 * `lib/seller/server-bootstrap.ts`. Its sole job is to fetch
 * `GET /seller/dashboard/tasks` for an already-authenticated active
 * seller and report a small, deliberate state machine:
 *
 *   ready        — backend returned a parseable action queue.
 *   unavailable  — backend is currently unreachable, returned 5xx,
 *                  or returned a body that does not match the
 *                  `/seller/dashboard/tasks` contract.
 *   auth_rejected — backend said the access token is no longer
 *                  accepted (HTTP 401).
 *
 * This module is server-only. It does NOT call Supabase signOut. A
 * transient failure here never destroys a valid Supabase session,
 * consistent with the auth foundation's principle.
 *
 * This module does NOT check role / status. Auth is settled before
 * this is invoked by the seller layout's auth guard.
 */

import { ApiError } from "@/lib/api/client";
import { resolveSession } from "@/lib/supabase/session";
import {
  fetchDashboardTasks,
  DASHBOARD_TASKS_CONTRACT_ERROR_PREFIX,
  type DashboardTasks,
} from "@/lib/seller/dashboard-tasks";

/**
 * Bootstrap result. `tasks` is present only on `ready`. The page
 * must handle `unavailable` and `auth_rejected` without signing the
 * user out.
 */
export type DashboardTasksBootstrap =
  | { state: "ready"; tasks: DashboardTasks }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

const isAbortError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  return (error as { name?: unknown }).name === "AbortError";
};

const isNetworkError = (error: unknown): boolean => {
  if (isAbortError(error)) return false;
  if (error instanceof TypeError) {
    return /fetch|network|connection|timeout/i.test(error.message);
  }
  if (error instanceof ApiError && error.status === 0) {
    return true;
  }
  return false;
};

const isContractError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return false;
  return message.startsWith(DASHBOARD_TASKS_CONTRACT_ERROR_PREFIX);
};

/**
 * Resolve the dashboard task list for the current request. The
 * caller passes a Supabase access token that the auth foundation has
 * just used to read `/auth/me`. We never read Supabase here
 * directly.
 */
export const resolveDashboardTasks = async (
  accessToken: string,
): Promise<DashboardTasksBootstrap> => {
  try {
    const tasks = await fetchDashboardTasks(accessToken, {
      cache: "no-store",
    });
    return { state: "ready", tasks };
  } catch (error) {
    if (isContractError(error) || isNetworkError(error)) {
      return { state: "unavailable" };
    }
    if (error instanceof ApiError) {
      if (error.status === 401) {
        return { state: "auth_rejected" };
      }
      if (error.status === 403 || error.status === 404) {
        return { state: "unavailable" };
      }
      if (error.status >= 500) {
        return { state: "unavailable" };
      }
    }
    return { state: "unavailable" };
  }
};

/**
 * Session-aware variant. Reads the current Supabase session's access
 * token from the server-side cookies and forwards it to
 * `resolveDashboardTasks`. The token is read via
 * `supabase.auth.getSession()` — the same call the auth foundation
 * uses — so the access token is consistent with the one used to
 * verify `/auth/me` and `/seller/me`.
 *
 * Returns `state: "unavailable"` if the session lookup itself
 * fails (network, abort, SDK error). It is the caller's
 * responsibility to gate this call behind an already-passed auth
 * guard; this helper does NOT assert role / status.
 */
export const resolveDashboardTasksFromSession =
  async (): Promise<DashboardTasksBootstrap> => {
    const session = await resolveSession();
    if (!session) return { state: "unavailable" };
    return resolveDashboardTasks(session.accessToken);
  };
