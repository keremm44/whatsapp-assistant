import { ApiError } from "@/lib/api/client";
import {
  fetchSellerEntitlements,
  SELLER_ENTITLEMENTS_CONTRACT_ERROR_PREFIX,
  type SellerEntitlements,
} from "@/lib/seller/entitlements";

export type SellerEntitlementBootstrap =
  | { state: "ready"; entitlements: SellerEntitlements }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

const isContractError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    message.startsWith(SELLER_ENTITLEMENTS_CONTRACT_ERROR_PREFIX)
  );
};

const isNetworkError = (error: unknown): boolean => {
  if (error instanceof TypeError) {
    return /fetch|network|connection|timeout/i.test(error.message);
  }
  return error instanceof ApiError && error.status === 0;
};

export const resolveSellerEntitlements = async (
  accessToken: string,
): Promise<SellerEntitlementBootstrap> => {
  try {
    const entitlements = await fetchSellerEntitlements(accessToken, {
      cache: "no-store",
    });
    return { state: "ready", entitlements };
  } catch (error) {
    if (isContractError(error) || isNetworkError(error)) {
      return { state: "unavailable" };
    }
    if (error instanceof ApiError) {
      if (error.status === 401) return { state: "auth_rejected" };
      if (error.status === 403 || error.status === 404 || error.status >= 500) {
        return { state: "unavailable" };
      }
    }
    return { state: "unavailable" };
  }
};
