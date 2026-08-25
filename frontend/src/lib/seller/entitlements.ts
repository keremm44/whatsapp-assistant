import { apiFetchWithAccessToken } from "@/lib/api/authenticated";
import {
  parseSellerEntitlements,
  type SellerEntitlements,
} from "@/lib/seller/entitlement-contract";

export {
  parseSellerEntitlements,
  SELLER_ENTITLEMENTS_CONTRACT_ERROR_PREFIX,
  type SellerEntitlements,
} from "@/lib/seller/entitlement-contract";

export const fetchSellerEntitlements = async (
  accessToken: string,
  options?: { signal?: AbortSignal; cache?: RequestCache },
): Promise<SellerEntitlements> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    "/seller/entitlements",
    accessToken,
    {
      signal: options?.signal,
      cache: options?.cache ?? "no-store",
    },
  );
  return parseSellerEntitlements(raw);
};
