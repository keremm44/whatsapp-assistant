/**
 * Server-side resolvers for the seller Conversations workbench.
 *
 * This module is the conversations-side companion of
 * `lib/seller/dashboard-tasks-server.ts`. It fetches the conversation
 * list and the selected conversation's workspace (detail + control)
 * for an already-authenticated active seller and reports small,
 * deliberate state machines:
 *
 *   ready        — backend returned parseable payloads.
 *   unavailable  — backend unreachable, 5xx, transient auth drift, or
 *                  a body that does not match the contract. The page
 *                  renders a calm retry surface; it must NOT pretend
 *                  the data is merely empty.
 *   not_found    — the requested conversation does not exist in this
 *                  seller's scope (HTTP 404).
 *   auth_rejected — backend said the access token is no longer
 *                  accepted (HTTP 401). Rare: the seller layout's auth
 *                  guard has already resolved the same token.
 *
 * This module is server-only. It does NOT call Supabase signOut. A
 * transient failure here never destroys a valid Supabase session,
 * consistent with the auth foundation's principle.
 *
 * This module does NOT check role / status. Auth is settled before
 * this is invoked by the seller layout's auth guard.
 */

import { ApiError } from "@/lib/api/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CONVERSATIONS_CONTRACT_ERROR_PREFIX,
  fetchConversationControl,
  fetchConversationDetail,
  fetchConversationList,
  type ConversationControlState,
  type ConversationControlView,
  type ConversationDetail,
  type ConversationListPage,
} from "@/lib/seller/conversations";

/**
 * The control area is deliberately decoupled from the message
 * history: if the control endpoint fails, the conversation timeline
 * must still render. Only the handoff control becomes unavailable
 * (and retryable in the client).
 */
export type ConversationControlBootstrap =
  | { state: "ready"; view: ConversationControlView }
  | { state: "unavailable" };

export type ConversationListBootstrap =
  | {
      state: "ready";
      page: ConversationListPage;
      /**
       * Server-side "now" captured at resolution time. Components use
       * it as the reference for relative timestamps so the SSR render
       * and the client hydration compute the identical phrase.
       */
      renderedAt: number;
    }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

export type ConversationWorkspaceBootstrap =
  | {
      state: "ready";
      detail: ConversationDetail;
      control: ConversationControlBootstrap;
      renderedAt: number;
    }
  | { state: "not_found" }
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
    const page = await fetchConversationList(accessToken, {
      attentionOnly: options?.attentionOnly === true,
      controlState: options?.controlState,
      cache: "no-store",
    });
    return { state: "ready", page, renderedAt: Date.now() };
  } catch (error) {
    if (isContractError(error) || isNetworkError(error)) {
      return { state: "unavailable" };
    }
    if (error instanceof ApiError) {
      if (error.status === 401) {
        return { state: "auth_rejected" };
      }
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
    // ANY control failure (network, 5xx, 404 drift, contract error,
    // even a 401 that arrived mid-request) degrades to a retryable
    // control area. The message history must keep rendering, and a
    // transient failure must never sign the seller out.
    return { state: "unavailable" };
  }
};

export const resolveConversationWorkspace = async (
  accessToken: string,
  customerId: number,
): Promise<ConversationWorkspaceBootstrap> => {
  // Detail and control resolve in parallel but DECOUPLE: a control
  // failure never takes the message history down with it.
  const [detailResult, controlResult] = await Promise.all([
    fetchConversationDetail(accessToken, customerId, {
      cache: "no-store",
    }).then(
      (detail) => ({ ok: true as const, detail }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    resolveControl(accessToken, customerId),
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
    renderedAt: Date.now(),
  };
};

/* ------------------------------------------------------------------ */
/* Session-aware variants (server cookie session -> access token)      */
/* ------------------------------------------------------------------ */

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
 * `state: "unavailable"` if the session lookup itself fails; the
 * seller layout's auth guard has already settled role/status.
 */
export const resolveConversationListFromSession = async (options?: {
  attentionOnly?: boolean;
  controlState?: ConversationControlState;
}): Promise<ConversationListBootstrap> => {
  const accessToken = await resolveAccessTokenFromSession();
  if (!accessToken) {
    return { state: "unavailable" };
  }
  return resolveConversationList(accessToken, options);
};

/** Workspace resolver (detail + control) gated on the server session. */
export const resolveConversationWorkspaceFromSession = async (
  customerId: number,
): Promise<ConversationWorkspaceBootstrap> => {
  const accessToken = await resolveAccessTokenFromSession();
  if (!accessToken) {
    return { state: "unavailable" };
  }
  return resolveConversationWorkspace(accessToken, customerId);
};
