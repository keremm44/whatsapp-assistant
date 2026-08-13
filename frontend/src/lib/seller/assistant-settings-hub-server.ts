/**
 * Server-side resolver for the Assistant Settings hub.
 *
 * Loads three independent sources in parallel:
 *   GET /seller/products          (active-only default)
 *   GET /seller/rules?active=true
 *   GET /seller/settings          (once, shared by two cards)
 *
 * One failed source never blanks the other cards.
 */

import { ApiError } from "@/lib/api/client";
import {
  SETTINGS_CONTRACT_ERROR_PREFIX,
  type SellerSettings,
} from "@/lib/seller/assistant-settings";
import { fetchSellerSettings } from "@/lib/seller/assistant-settings-api";
import { fetchProductList } from "@/lib/seller/products-api";
import { PRODUCTS_CONTRACT_ERROR_PREFIX } from "@/lib/seller/products";
import { fetchRuleList } from "@/lib/seller/rules-api";
import { RULES_CONTRACT_ERROR_PREFIX } from "@/lib/seller/rules";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type HubSource<T> =
  | { state: "ready"; data: T }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

export type AssistantSettingsHubBootstrap = {
  products: HubSource<{ activeCount: number }>;
  rules: HubSource<{ activeCount: number }>;
  settings: HubSource<SellerSettings>;
};

const isAbortError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  return (error as { name?: unknown }).name === "AbortError";
};

const isNetworkError = (error: unknown): boolean => {
  if (isAbortError(error)) return false;
  if (error instanceof TypeError) {
    return /fetch|network|connection|timeout/i.test(error.message);
  }
  return error instanceof ApiError && error.status === 0;
};

const isPrefixedContractError = (error: unknown, prefix: string): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.startsWith(prefix);
};

const classifyFailure = (
  error: unknown,
  prefix: string,
): "auth_rejected" | "unavailable" => {
  if (error instanceof ApiError && error.status === 401) return "auth_rejected";
  if (isPrefixedContractError(error, prefix) || isNetworkError(error)) {
    return "unavailable";
  }
  return "unavailable";
};

const resolveActiveProducts = async (
  accessToken: string,
): Promise<HubSource<{ activeCount: number }>> => {
  try {
    const page = await fetchProductList(accessToken, { cache: "no-store" });
    if (page.products.some((product) => product.isActive !== true)) {
      return { state: "unavailable" };
    }
    return { state: "ready", data: { activeCount: page.total } };
  } catch (error) {
    return { state: classifyFailure(error, PRODUCTS_CONTRACT_ERROR_PREFIX) };
  }
};

const resolveActiveRules = async (
  accessToken: string,
): Promise<HubSource<{ activeCount: number }>> => {
  try {
    const page = await fetchRuleList(accessToken, {
      active: true,
      cache: "no-store",
    });
    return { state: "ready", data: { activeCount: page.rules.length } };
  } catch (error) {
    return { state: classifyFailure(error, RULES_CONTRACT_ERROR_PREFIX) };
  }
};

const resolveSettings = async (
  accessToken: string,
): Promise<HubSource<SellerSettings>> => {
  try {
    const settings = await fetchSellerSettings(accessToken, {
      cache: "no-store",
    });
    return { state: "ready", data: settings };
  } catch (error) {
    return { state: classifyFailure(error, SETTINGS_CONTRACT_ERROR_PREFIX) };
  }
};

export const resolveAssistantSettingsHub = async (
  accessToken: string,
): Promise<AssistantSettingsHubBootstrap> => {
  const [products, rules, settings] = await Promise.all([
    resolveActiveProducts(accessToken),
    resolveActiveRules(accessToken),
    resolveSettings(accessToken),
  ]);
  return { products, rules, settings };
};

export const resolveAssistantSettingsHubFromSession =
  async (): Promise<AssistantSettingsHubBootstrap> => {
    const unavailable: AssistantSettingsHubBootstrap = {
      products: { state: "unavailable" },
      rules: { state: "unavailable" },
      settings: { state: "unavailable" },
    };
    const supabase = await createSupabaseServerClient();
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) return unavailable;
      return resolveAssistantSettingsHub(data.session.access_token);
    } catch {
      return unavailable;
    }
  };
