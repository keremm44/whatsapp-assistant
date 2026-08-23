/**
 * Server-side resolvers for the seller Conversations workbench.
 */

import { ApiError } from "@/lib/api/client";
import { apiFetchWithAccessToken } from "@/lib/api/authenticated";
import { resolveSession } from "@/lib/supabase/session";
import {
  CONVERSATIONS_CONTRACT_ERROR_PREFIX,
  fetchConversationControl,
  fetchConversationDetail,
  fetchConversationListV2,
  type ConversationControlState,
  type ConversationControlView,
  type ConversationDetail,
  type ConversationListPageV2,
} from "@/lib/seller/conversations";

export type ConversationAiUsage = {
  date: string | null;
  callCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  updatedAt: string | null;
};

export type ConversationAiContext = {
  summary: string | null;
  memoryIncomplete: boolean;
  summaryUpdatedAt: string | null;
  usage: ConversationAiUsage | null;
};

export type ConversationControlBootstrap =
  | { state: "ready"; view: ConversationControlView }
  | { state: "unavailable" };

export type ConversationListBootstrap =
  | {
      state: "ready";
      page: ConversationListPageV2;
      renderedAt: number;
    }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

export type ConversationWorkspaceBootstrap =
  | {
      state: "ready";
      detail: ConversationDetail;
      control: ConversationControlBootstrap;
      aiContext: ConversationAiContext | null;
      renderedAt: number;
    }
  | { state: "not_found" }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nullableString = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
};

const nonNegativeInteger = (value: unknown): number | undefined =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value >= 0
    ? value
    : undefined;

const parseAiContext = (raw: unknown): ConversationAiContext | null => {
  if (!isPlainObject(raw) || !("ai_context" in raw)) return null;
  const context = raw.ai_context;
  if (!isPlainObject(context)) return null;

  const summary = nullableString(context.summary);
  const summaryUpdatedAt = nullableString(context.summary_updated_at);
  if (
    summary === undefined ||
    summaryUpdatedAt === undefined ||
    typeof context.memory_incomplete !== "boolean"
  ) {
    return null;
  }

  let usage: ConversationAiUsage | null = null;
  if (context.usage !== null && context.usage !== undefined) {
    if (!isPlainObject(context.usage)) return null;
    const date = nullableString(context.usage.date);
    const updatedAt = nullableString(context.usage.updated_at);
    const callCount = nonNegativeInteger(context.usage.call_count);
    const promptTokens = nonNegativeInteger(context.usage.prompt_tokens);
    const completionTokens = nonNegativeInteger(context.usage.completion_tokens);
    const totalTokens = nonNegativeInteger(context.usage.total_tokens);
    if (
      date === undefined ||
      updatedAt === undefined ||
      callCount === undefined ||
      promptTokens === undefined ||
      completionTokens === undefined ||
      totalTokens === undefined
    ) {
      return null;
    }
    usage = {
      date,
      callCount,
      promptTokens,
      completionTokens,
      totalTokens,
      updatedAt,
    };
  }

  return {
    summary,
    memoryIncomplete: context.memory_incomplete,
    summaryUpdatedAt,
    usage,
  };
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
  if (error instanceof ApiError && error.status === 0) {
    return true;
  }
  return false;
};

const isContractError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return false;
  return message.startsWith(CONVERSATIONS_CONTRACT_ERROR_PREFIX);
};

export const resolveConversationList = async (
  accessToken: string,
  options?: {
    attentionOnly?: boolean;
    controlState?: ConversationControlState;
  },
): Promise<ConversationListBootstrap> => {
  try {
    const page = await fetchConversationListV2(accessToken, {
      attentionOnly: options?.attentionOnly === true,
      controlState: options?.controlState,
      cache: "no-store",
    });
    return { state: "ready", page, renderedAt: Date.now() };
  } catch (error) {
    if (isContractError(error) || isNetworkError(error)) {
      return { state: "unavailable" };
    }
    if (error instanceof ApiError && error.status === 401) {
      return { state: "auth_rejected" };
    }
    return { state: "unavailable" };
  }
};

const resolveControl = async (
  accessToken: string,
  customerId: number,
): Promise<ConversationControlBootstrap> => {
  try {
    const view = await fetchConversationControl(accessToken, customerId, {
      cache: "no-store",
    });
    return { state: "ready", view };
  } catch {
    return { state: "unavailable" };
  }
};

const resolveAiContext = async (
  accessToken: string,
  customerId: number,
): Promise<ConversationAiContext | null> => {
  try {
    const raw = await apiFetchWithAccessToken<unknown>(
      `/seller/conversations/${customerId}?message_limit=1&control_history_limit=1`,
      accessToken,
      { cache: "no-store" },
    );
    return parseAiContext(raw);
  } catch {
    return null;
  }
};

export const resolveConversationWorkspace = async (
  accessToken: string,
  customerId: number,
): Promise<ConversationWorkspaceBootstrap> => {
  const [detailResult, controlResult, aiContext] = await Promise.all([
    fetchConversationDetail(accessToken, customerId, {
      cache: "no-store",
    }).then(
      (detail) => ({ ok: true as const, detail }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    resolveControl(accessToken, customerId),
    resolveAiContext(accessToken, customerId),
  ]);

  if (!detailResult.ok) {
    const error = detailResult.error;
    if (error instanceof ApiError && error.status === 404) {
      return { state: "not_found" };
    }
    if (error instanceof ApiError && error.status === 401) {
      return { state: "auth_rejected" };
    }
    return { state: "unavailable" };
  }

  return {
    state: "ready",
    detail: detailResult.detail,
    control: controlResult,
    aiContext,
    renderedAt: Date.now(),
  };
};



export const resolveConversationListFromSession = async (options?: {
  attentionOnly?: boolean;
  controlState?: ConversationControlState;
}): Promise<ConversationListBootstrap> => {
  const session = await resolveSession();
  if (!session) return { state: "unavailable" };
  return resolveConversationList(session.accessToken, options);
};

export const resolveConversationWorkspaceFromSession = async (
  customerId: number,
): Promise<ConversationWorkspaceBootstrap> => {
  const session = await resolveSession();
  if (!session) return { state: "unavailable" };
  return resolveConversationWorkspace(session.accessToken, customerId);
};
