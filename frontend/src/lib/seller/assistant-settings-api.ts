/**
 * Seller settings — authenticated fetchers.
 *
 * Environment-neutral: every function takes an already-resolved access
 * token. Contract parsing lives in `assistant-settings.ts`.
 *
 *   GET   /seller/settings
 *   PATCH /seller/settings
 *
 * The browser never queries sellers/product_info directly.
 */

import { apiFetchWithAccessToken } from "@/lib/api/authenticated";
import {
  parseSellerSettingsResponse,
  type SellerSettings,
  type SellerSettingsPatchPayload,
} from "@/lib/seller/assistant-settings";

export type FetchSellerSettingsOptions = {
  signal?: AbortSignal;
  cache?: RequestCache;
};

export const fetchSellerSettings = async (
  accessToken: string,
  options?: FetchSellerSettingsOptions,
): Promise<SellerSettings> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    "/seller/settings",
    accessToken,
    { signal: options?.signal, cache: options?.cache ?? "no-store" },
  );
  return parseSellerSettingsResponse(raw);
};

export type PatchSellerSettingsOptions = {
  signal?: AbortSignal;
};

export const patchSellerSettings = async (
  accessToken: string,
  payload: SellerSettingsPatchPayload,
  options?: PatchSellerSettingsOptions,
): Promise<SellerSettings> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    "/seller/settings",
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
      signal: options?.signal,
      cache: "no-store",
    },
  );
  return parseSellerSettingsResponse(raw);
};
