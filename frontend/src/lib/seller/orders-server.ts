/**
 * Server-side resolver for the Seller Orders production worklist.
 *
 * Mirrors the conversations resolver discipline: the first page is
 * resolved on the server from the same Supabase session the seller
 * layout's auth guard just validated, and reported as a small state
 * machine:
 *
 *   ready         — backend returned a parseable page.
 *   unavailable   — backend unreachable, 5xx, transient failure, or a
 *                   body that does not match the contract. The page
 *                   renders a calm retry surface and never pretends
 *                   the data is merely empty.
 *   auth_rejected — backend said HTTP 401 (rare; the layout guard
 *                   already resolved the same token).
 *
 * This module is server-only and never signs the seller out. Auth
 * role/status is settled by the seller layout before this runs.
 */

import { ApiError } from "@/lib/api/client";
import { fetchOrderList } from "@/lib/seller/orders-api";
import {
  ORDERS_CONTRACT_ERROR_PREFIX,
  type OrderListPage,
  type OrderView,
} from "@/lib/seller/orders";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrderListBootstrap =
  | {
      state: "ready";
      page: OrderListPage;
    }
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
  return message.startsWith(ORDERS_CONTRACT_ERROR_PREFIX);
};

export const resolveOrderList = async (
  accessToken: string,
  options: { view: OrderView; externalOrderNumber: string | null },
): Promise<OrderListBootstrap> => {
  try {
    const page = await fetchOrderList(accessToken, {
      view: options.view,
      externalOrderNumber: options.externalOrderNumber,
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
export const resolveOrderListFromSession = async (options: {
  view: OrderView;
  externalOrderNumber: string | null;
}): Promise<OrderListBootstrap> => {
  const accessToken = await resolveAccessTokenFromSession();
  if (!accessToken) {
    return { state: "unavailable" };
  }
  return resolveOrderList(accessToken, options);
};
