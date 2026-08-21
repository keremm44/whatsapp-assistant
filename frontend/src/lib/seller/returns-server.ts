/**
 * Server-side resolvers for the Seller “İade ve Sorunlar” workspace.
 *
 * Mirrors the Orders/Conversations resolver discipline: the first list
 * page (and the selected request's detail, when the URL carries one)
 * are resolved on the server from the same Supabase session the seller
 * layout's auth guard just validated, reported as small state machines:
 *
 *   ready         — backend returned a parseable payload.
 *   unavailable   — backend unreachable, 5xx, transient failure, or a
 *                   body that does not match the contract. The page
 *                   renders a calm retry surface and never pretends
 *                   the data is merely empty.
 *   not_found     — detail only: HTTP 404 (unknown/other-tenant id,
 *                   or a request that disappeared between renders).
 *   auth_rejected — backend said HTTP 401 (rare; the layout guard
 *                   already resolved the same token).
 *
 * This module is server-only and never signs the seller out. Auth
 * role/status is settled by the seller layout before this runs.
 */

import { ApiError } from "@/lib/api/client";
import { fetchReturnDetail, fetchReturnListV2 } from "@/lib/seller/returns-api";
import {
  RETURNS_CONTRACT_ERROR_PREFIX,
  type ReturnIssueType,
  type ReturnListPageV2,
  type ReturnRequestDetail,
  type ReturnView,
} from "@/lib/seller/returns";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReturnListBootstrap =
  | { state: "ready"; page: ReturnListPageV2 }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

export type ReturnDetailBootstrap =
  | { state: "ready"; detail: ReturnRequestDetail }
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
  return message.startsWith(RETURNS_CONTRACT_ERROR_PREFIX);
};

export const resolveReturnList = async (
  accessToken: string,
  options: {
    view: ReturnView;
    externalOrderNumber: string | null;
    issueType: ReturnIssueType | null;
  },
): Promise<ReturnListBootstrap> => {
  try {
    const page = await fetchReturnListV2(accessToken, {
      view: options.view,
      externalOrderNumber: options.externalOrderNumber,
      issueType: options.issueType,
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

export const resolveReturnDetail = async (
  accessToken: string,
  requestId: number,
): Promise<ReturnDetailBootstrap> => {
  try {
    const detail = await fetchReturnDetail(accessToken, requestId, {
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
export const resolveReturnListFromSession = async (options: {
  view: ReturnView;
  externalOrderNumber: string | null;
  issueType: ReturnIssueType | null;
}): Promise<ReturnListBootstrap> => {
  const accessToken = await resolveAccessTokenFromSession();
  if (!accessToken) {
    return { state: "unavailable" };
  }
  return resolveReturnList(accessToken, options);
};

/**
 * Detail resolver gated on the current server session. Returns
 * `state: "unavailable"` if the session lookup itself fails.
 */
export const resolveReturnDetailFromSession = async (
  requestId: number,
): Promise<ReturnDetailBootstrap> => {
  const accessToken = await resolveAccessTokenFromSession();
  if (!accessToken) {
    return { state: "unavailable" };
  }
  return resolveReturnDetail(accessToken, requestId);
};
