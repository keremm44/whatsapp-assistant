/**
 * Seller Rules — authenticated fetchers.
 */

import { apiFetchWithAccessToken } from "@/lib/api/authenticated";
import {
  parseRuleDeactivateResponse,
  parseRuleListResponse,
  parseRuleMutationResponse,
  type CreateRulePayload,
  type RuleDeactivateResult,
  type RuleListPage,
  type RuleMutationResult,
  type UpdateRulePayload,
} from "@/lib/seller/rules";

export type FetchRulesOptions = {
  active?: boolean;
  signal?: AbortSignal;
  cache?: RequestCache;
};

export const fetchRuleList = async (
  accessToken: string,
  options?: FetchRulesOptions,
): Promise<RuleListPage> => {
  const query = new URLSearchParams();
  if (options?.active === true) query.set("active", "true");
  if (options?.active === false) query.set("active", "false");
  const qs = query.toString();
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/rules${qs ? `?${qs}` : ""}`,
    accessToken,
    { signal: options?.signal, cache: options?.cache ?? "no-store" },
  );
  return parseRuleListResponse(raw);
};

export const createRule = async (
  accessToken: string,
  payload: CreateRulePayload,
  options?: { signal?: AbortSignal },
): Promise<RuleMutationResult> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    "/seller/rules",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(payload),
      signal: options?.signal,
      cache: "no-store",
    },
  );
  return parseRuleMutationResponse(raw);
};

export const updateRule = async (
  accessToken: string,
  ruleId: number,
  payload: UpdateRulePayload,
  options?: { signal?: AbortSignal },
): Promise<RuleMutationResult> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/rules/${ruleId}`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
      signal: options?.signal,
      cache: "no-store",
    },
  );
  return parseRuleMutationResponse(raw);
};

export const deactivateRule = async (
  accessToken: string,
  ruleId: number,
  expectedVersion: number,
  options?: { signal?: AbortSignal },
): Promise<RuleDeactivateResult> => {
  const query = new URLSearchParams();
  query.set("expected_version", String(expectedVersion));
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/rules/${ruleId}?${query.toString()}`,
    accessToken,
    {
      method: "DELETE",
      signal: options?.signal,
      cache: "no-store",
    },
  );
  return parseRuleDeactivateResponse(raw);
};
