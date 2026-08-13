/**
 * Server-side resolvers for Seller Rules.
 */

import { ApiError } from "@/lib/api/client";
import { fetchRuleList } from "@/lib/seller/rules-api";
import {
  RULES_CONTRACT_ERROR_PREFIX,
  type RuleListPage,
  type RuleView,
} from "@/lib/seller/rules";
import { activeQueryForView } from "@/lib/seller/rules-format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RulesListBootstrap =
  | { state: "ready"; page: RuleListPage }
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
  return error instanceof ApiError && error.status === 0;
};

const classifyFailure = (
  error: unknown,
): "auth_rejected" | "unavailable" => {
  if (error instanceof ApiError && error.status === 401) return "auth_rejected";
  if (
    (typeof error === "object" &&
      error !== null &&
      typeof (error as { message?: unknown }).message === "string" &&
      (error as { message: string }).message.startsWith(
        RULES_CONTRACT_ERROR_PREFIX,
      )) ||
    isNetworkError(error)
  ) {
    return "unavailable";
  }
  return "unavailable";
};

export const resolveRuleList = async (
  accessToken: string,
  view: RuleView,
): Promise<RulesListBootstrap> => {
  try {
    const page = await fetchRuleList(accessToken, {
      active: activeQueryForView(view),
      cache: "no-store",
    });
    return { state: "ready", page };
  } catch (error) {
    return { state: classifyFailure(error) };
  }
};

export const resolveRuleListFromSession = async (
  view: RuleView,
): Promise<RulesListBootstrap> => {
  const supabase = await createSupabaseServerClient();
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) return { state: "unavailable" };
    return resolveRuleList(data.session.access_token, view);
  } catch {
    return { state: "unavailable" };
  }
};
