import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

import {
  parseUnansweredActionResponse,
  parseUnansweredDetailResponse,
  parseUnansweredListResponse,
} from "./unanswered.ts";


type SharedContract = {
  schema_version: number;
  conversations: {
    list_response: unknown;
    detail_response: unknown;
    control_response: unknown;
  };
  unanswered: {
    list_response: unknown;
    detail_response: unknown;
    action_response: unknown;
  };
};

type ResolveContext = {
  parentURL?: string;
};

type ResolveHook = (
  specifier: string,
  context: ResolveContext,
  nextResolve: (specifier: string, context: ResolveContext) => unknown,
) => unknown;

const registerHooks = (
  nodeModule as unknown as {
    registerHooks: (hooks: { resolve: ResolveHook }) => void;
  }
).registerHooks;

const srcRoot = new URL("../../", import.meta.url);
const hasTypedExtension = (specifier: string): boolean =>
  /\.[cm]?[jt]sx?$/.test(specifier);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const relative = specifier.slice(2);
      const suffix = hasTypedExtension(relative) ? "" : ".ts";
      return {
        url: new URL(`${relative}${suffix}`, srcRoot).href,
        shortCircuit: true,
      };
    }

    if (
      specifier.startsWith(".") &&
      context.parentURL?.endsWith(".ts") &&
      !hasTypedExtension(specifier)
    ) {
      return {
        url: new URL(`${specifier}.ts`, context.parentURL).href,
        shortCircuit: true,
      };
    }

    return nextResolve(specifier, context);
  },
});

const contractUrl = new URL(
  "../../../../contracts/seller-conversations-unanswered-v1.json",
  import.meta.url,
);
const contract = JSON.parse(
  readFileSync(contractUrl, "utf8"),
) as SharedContract;


test("shared Conversations fixtures pass through the real frontend fetch/parser contract", async (t) => {
  assert.equal(contract.schema_version, 1);

  const originalFetch = globalThis.fetch;
  const originalApiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiBase === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBase;
    }
  });

  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.test";

  let responsePayload: unknown = null;
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    requestedUrl = input instanceof Request ? input.url : String(input);
    requestedInit = init;
    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const conversations = await import("./conversations.ts");

  responsePayload = contract.conversations.list_response;
  const list = await conversations.fetchConversationList("test-token", {
    attentionOnly: true,
    controlState: "RETURN_REVIEW",
    limit: 20,
    offset: 0,
  });

  assert.equal(
    requestedUrl,
    "https://api.test/seller/conversations?attention_only=true&control_state=RETURN_REVIEW&limit=20&offset=0",
  );
  assert.equal(
    new Headers(requestedInit?.headers).get("Authorization"),
    "Bearer test-token",
  );
  assert.equal(list.total, 1);
  assert.equal(list.controlState, "RETURN_REVIEW");
  assert.equal(list.conversations[0]?.control?.state, "RETURN_REVIEW");
  assert.equal(list.conversations[0]?.control?.version, 4);
  assert.equal(list.conversations[0]?.attentionReason, "return_review");
  assert.equal(list.conversations[0]?.activeOrder?.id, 18);
  assert.equal(list.conversations[0]?.activeReturnIssue?.id, 41);
  assert.equal(list.conversations[0]?.openUnanswered?.id, 61);

  responsePayload = contract.conversations.detail_response;
  const detail = await conversations.fetchConversationDetail(
    "test-token",
    22,
    {
      messageLimit: 50,
      controlHistoryLimit: 20,
    },
  );

  assert.equal(
    requestedUrl,
    "https://api.test/seller/conversations/22?message_limit=50&control_history_limit=20",
  );
  assert.equal(detail.customer.id, 22);
  assert.equal(detail.control?.state, "RETURN_REVIEW");
  assert.equal(detail.control?.version, 4);
  assert.equal(detail.messagePage.hasMore, true);
  assert.equal(detail.messagePage.nextBeforeMessageId, 979);
  assert.equal(detail.controlHistory[0]?.toState, "RETURN_REVIEW");
  assert.equal(detail.activeOrder?.status, "SELLER_REVIEW_REQUIRED");
  assert.equal(detail.activeReturnIssue?.issueType, "DAMAGED_ITEM");
  assert.equal(detail.openUnanswered[0]?.id, 61);

  responsePayload = contract.conversations.control_response;
  const control = await conversations.fetchConversationControl(
    "test-token",
    22,
  );

  assert.equal(
    requestedUrl,
    "https://api.test/seller/conversations/22/control",
  );
  assert.equal(control.control.state, "RETURN_REVIEW");
  assert.equal(control.control.displayName, "İade incelemesi");
  assert.equal(control.control.version, 4);
  assert.deepEqual(control.capabilities, {
    canTakeOver: true,
    canResumeAssistant: true,
    canPauseAssistant: false,
    canActivateAssistant: true,
  });
});


test("shared Unanswered fixtures pass through the real frontend parsers", () => {
  assert.equal(contract.schema_version, 1);

  const list = parseUnansweredListResponse(
    contract.unanswered.list_response,
  );
  assert.equal(list.view, "action_required");
  assert.equal(list.pageCount, 1);
  assert.equal(list.questions[0]?.id, 61);
  assert.equal(list.questions[0]?.status, "OPEN");
  assert.equal(list.questions[0]?.version, 2);

  const detail = parseUnansweredDetailResponse(
    contract.unanswered.detail_response,
  );
  assert.equal(detail.question.id, 61);
  assert.equal(
    detail.question.canonicalQuestion,
    "Kargoya ne zaman verilir?",
  );
  assert.equal(detail.occurrences.length, 2);
  assert.equal(detail.occurrences[1]?.customerId, 22);

  const action = parseUnansweredActionResponse(
    contract.unanswered.action_response,
  );
  assert.equal(action.action, "set_answer");
  assert.equal(action.changed, true);
  assert.equal(action.question.status, "ANSWERED");
  assert.equal(action.question.version, 3);
  assert.equal(
    action.question.answerText,
    "Siparişler iki iş günü içinde kargoya verilir.",
  );
});
