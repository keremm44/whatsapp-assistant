import "server-only";
import { resolveSession } from "@/lib/supabase/session";
import {
  fetchAdminSeller,
  fetchAdminSellers,
  type AdminSeller,
  type AdminSellerPage,
} from "./sellers-api";
import type { AdminSellerSystemStatus } from "./seller-format";

export type SellerListBootstrap =
  | { state: "ready"; page: AdminSellerPage }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

export type SellerDetailBootstrap =
  | { state: "ready"; seller: AdminSeller }
  | { state: "not_found" }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

const httpStatus = (e: unknown): number => {
  if (e && typeof e === "object" && "status" in e) {
    return (e as { status?: number }).status ?? 0;
  }
  return 0;
};

export const resolveAdminSellersFromSession = async (input: {
  q?: string;
  status?: AdminSellerSystemStatus;
  limit?: number;
  offset?: number;
}): Promise<SellerListBootstrap> => {
  const session = await resolveSession();
  if (!session) return { state: "unavailable" };
  try {
    return { state: "ready", page: await fetchAdminSellers(session.accessToken, input) };
  } catch (e) {
    return httpStatus(e) === 401
      ? { state: "auth_rejected" }
      : { state: "unavailable" };
  }
};

export const resolveAdminSellerFromSession = async (
  id: number,
): Promise<SellerDetailBootstrap> => {
  const session = await resolveSession();
  if (!session) return { state: "unavailable" };
  try {
    return { state: "ready", seller: await fetchAdminSeller(session.accessToken, id) };
  } catch (e) {
    if (httpStatus(e) === 404) return { state: "not_found" };
    return httpStatus(e) === 401
      ? { state: "auth_rejected" }
      : { state: "unavailable" };
  }
};
