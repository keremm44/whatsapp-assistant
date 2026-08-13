/**
 * Server-side resolver for seller settings.
 *
 * Same state machine as products/rules:
 *   ready / unavailable / auth_rejected
 *
 * Never signs the seller out. An unavailable settings response is
 * never treated as empty/default settings.
 */

import { ApiError } from "@/lib/api/client";
import {
  SETTINGS_CONTRACT_ERROR_PREFIX,
  type SellerSettings,
} from "@/lib/seller/assistant-settings";
import { fetchSellerSettings } from "@/lib/seller/assistant-settings-api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SellerSettingsBootstrap =
  | { state: "ready"; settings: SellerSettings }
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
  return (
    typeof message === "string" &&
    message.startsWith(SETTINGS_CONTRACT_ERROR_PREFIX)
  );
};

const classifyFailure = (
  error: unknown,
): "auth_rejected" | "unavailable" => {
  if (error instanceof ApiError && error.status === 401) {
    return "auth_rejected";
  }
  if (isContractError(error) || isNetworkError(error)) {
    return "unavailable";
  }
  return "unavailable";
};

export const resolveSellerSettings = async (
  accessToken: string,
): Promise<SellerSettingsBootstrap> => {
  try {
    const settings = await fetchSellerSettings(accessToken, {
      cache: "no-store",
    });
    return { state: "ready", settings };
  } catch (error) {
    return { state: classifyFailure(error) };
  }
};

export const resolveSellerSettingsFromSession =
  async (): Promise<SellerSettingsBootstrap> => {
    const supabase = await createSupabaseServerClient();
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) {
        return { state: "unavailable" };
      }
      return resolveSellerSettings(data.session.access_token);
    } catch {
      return { state: "unavailable" };
    }
  };
