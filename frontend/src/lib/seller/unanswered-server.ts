/**
 * Server-side resolvers for the Seller “Cevaplanamayan Sorular”
 * workspace.
 *
 * Mirrors the Returns/Orders/Conversations resolver discipline: the
 * first list page (and the selected question's detail, when the URL
 * carries one) are resolved on the server from the same Supabase
 * session the seller layout's auth guard just validated, reported as
 * small state machines:
 *
 *   ready         — backend returned a parseable payload.
 *   unavailable   — backend unreachable, 5xx, transient failure, or a
 *                   body that does not match the contract. The page
 *                   renders a calm retry surface and never pretends
 *                   the data is merely empty.
 *   not_found     — detail only: HTTP 404 (unknown/other-tenant id,
 *                   or a group that disappeared between renders).
 *   auth_rejected — backend said HTTP 401 (rare; the layout guard
 *                   already resolved the same token).
 *
 * This module is server-only and never signs the seller out. Auth
 * role/status is settled by the seller layout before this runs.
 */

import { ApiError } from "@/lib/api/client";
import {
  fetchUnansweredDetail,
  fetchUnansweredListV2,
} from "@/lib/seller/unanswered-api";
import {
  UNANSWERED_CONTRACT_ERROR_PREFIX,
  type UnansweredListPageV2,
  type UnansweredQuestionDetail,
  type UnansweredView,
} from "@/lib/seller/unanswered";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UnansweredListBootstrap =
  | { state: "ready"; page: UnansweredListPageV2 }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

export type UnansweredDetailBootstrap =
  | { state: "ready"; detail: UnansweredQuestionDetail }
  | { state: "not_found" }
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
  return message.startsWith(UNANSWERED_CONTRACT_ERROR_PREFIX);
};

export const resolveUnansweredList = async (
  accessToken: string,
  options: { view: UnansweredView },
): Promise<UnansweredListBootstrap> => {
  try {
    const page = await fetchUnansweredListV2(accessToken, {
      view: options.view,
      cache: "no-store",
    });
    return { state: "ready", page };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { state: "auth_rejected" };
    }
    if (isContractError(error) || isNetworkError(error)) {
      return { state: "unavailable" };
    }
    return { state: "unavailable" };
  }
};

export const resolveUnansweredDetail = async (
  accessToken: string,
  groupId: number,
): Promise<UnansweredDetailBootstrap> => {
  try {
    const detail = await fetchUnansweredDetail(accessToken, groupId, {
      cache: "no-store",
    });
    return { state: "ready", detail };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) return { state: "auth_rejected" };
      if (error.status === 404) return { state: "not_found" };
    }
    if (isContractError(error) || isNetworkError(error)) {
      return { state: "unavailable" };
    }
    return { state: "unavailable" };
  }
};

const resolveAccessTokenFromSession = async (): Promise<string | null> => {
  const supabase = await createSupabaseServerClient();
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return null;
    }
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
};

/**
 * List resolver gated on the current server session. Returns
 * `state: "unavailable"` if the session lookup itself fails.
 */
export const resolveUnansweredListFromSession = async (options: {
  view: UnansweredView;
}): Promise<UnansweredListBootstrap> => {
  const accessToken = await resolveAccessTokenFromSession();
  if (!accessToken) {
    return { state: "unavailable" };
  }
  return resolveUnansweredList(accessToken, options);
};

/**
 * Detail resolver gated on the current server session. Returns
 * `state: "unavailable"` if the session lookup itself fails.
 */
export const resolveUnansweredDetailFromSession = async (
  groupId: number,
): Promise<UnansweredDetailBootstrap> => {
  const accessToken = await resolveAccessTokenFromSession();
  if (!accessToken) {
    return { state: "unavailable" };
  }
  return resolveUnansweredDetail(accessToken, groupId);
};
