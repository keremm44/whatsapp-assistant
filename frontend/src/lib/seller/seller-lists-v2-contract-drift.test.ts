import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

import { parseOrdersListV2Response } from "./orders.ts";
import { parseReturnListV2Response } from "./returns.ts";
import { parseUnansweredListV2Response } from "./unanswered.ts";

/**
 * Drift guard for contracts/seller-lists-v2.json — the signed,
 * seller-bound cursor (keyset) list surface:
 *
 *   GET /seller/orders/v2
 *   GET /seller/return-issue-requests/v2
 *   GET /seller/unanswered-questions/v2
 *   GET /seller/conversations/v2
 *
 * Every success_example must parse through the REAL frontend
 * contract layer (the same parsers the fetchers use), and the
 * response envelope must be exactly {items, has_more, next_cursor}.
 */

type V2EndpointContract = {
  endpoint: string;
  response: {
    success_example: {
      items: unknown[];
      has_more: boolean;
      next_cursor: string | null;
    };
  };
};

type V2Contract = {
  schema_version: number;
  endpoints: {
    orders: V2EndpointContract;
    returns: V2EndpointContract;
    unanswered: V2EndpointContract;
    conversations: V2EndpointContract;
  };
};

type ResolveContext = { parentURL?: string };
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
  /\.(cm)?[jt]sx?$/.test(specifier);

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
  "../../../../contracts/seller-lists-v2.json",
  import.meta.url,
);
const contract = JSON.parse(readFileSync(contractUrl, "utf8")) as V2Contract;

const assertEnvelope = (
  example: V2EndpointContract["response"]["success_example"],
): void => {
  // The v2 envelope is EXACTLY these three keys.
  assert.deepEqual(Object.keys(example).sort(), [
    "has_more",
    "items",
    "next_cursor",
  ]);
  assert.ok(Array.isArray(example.items));
  assert.equal(typeof example.has_more, "boolean");
  if (example.has_more) {
    assert.equal(typeof example.next_cursor, "string");
    assert.ok((example.next_cursor as string).length > 0);
  } else {
    assert.equal(example.next_cursor, null);
  }
};

test("v2 contract: orders success_example parses through the frontend contract", () => {
  assert.equal(contract.schema_version, 1);
  assert.equal(contract.endpoints.orders.endpoint, "GET /seller/orders/v2");
  const example = contract.endpoints.orders.response.success_example;
  assertEnvelope(example);

  const page = parseOrdersListV2Response(example);
  assert.equal(page.hasMore, example.has_more);
  assert.equal(page.nextCursor, example.next_cursor);
  assert.equal(page.items.length, example.items.length);
  assert.equal(page.items[0]?.id, 41);
  assert.equal(page.items[0]?.displayStatus, "Bilgi toplanıyor");
  assert.equal(page.items[0]?.hasImage, true);
  assert.equal(page.items[0]?.sellerActionRequired, false);
});

test("v2 contract: returns success_example parses through the frontend contract", () => {
  const example = contract.endpoints.returns.response.success_example;
  assertEnvelope(example);

  const page = parseReturnListV2Response(example);
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, null);
  const item = page.items[0];
  assert.equal(item?.issueType, "QUANTITY_LIMIT_REQUEST");
  assert.equal(item?.customerPhone, "+905321112233");
  assert.equal(item?.displayIssueType, "Adet sınırı talebi");
  assert.equal(item?.sellerActionRequired, true);
});

test("v2 contract: unanswered success_example parses through the frontend contract", () => {
  const example = contract.endpoints.unanswered.response.success_example;
  assertEnvelope(example);

  const page = parseUnansweredListV2Response(example);
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, null);
  assert.equal(page.items[0]?.id, 61);
  assert.equal(page.items[0]?.status, "OPEN");
  assert.equal(page.items[0]?.sellerActionRequired, true);
});

test("v2 contract: conversations success_example parses through the frontend contract", async () => {
  const example = contract.endpoints.conversations.response.success_example;
  assertEnvelope(example);

  const conversations = await import("./conversations.ts");
  const page = conversations.parseConversationListV2Response(example);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextCursor, example.next_cursor);
  const item = page.items[0];
  assert.equal(item?.customer.id, 22);
  assert.equal(item?.control?.state, "RETURN_REVIEW");
  assert.equal(item?.activeOrder?.customerId, 22);
  assert.equal(item?.activeOrder?.sellerActionRequired, true);
  assert.equal(item?.activeReturnIssue?.sellerActionRequired, true);
  assert.equal(item?.openUnanswered?.id, 61);
  assert.equal(item?.attentionReason, "return_review");
});

test("v2 contract: next_cursor invariants are enforced by the parsers", () => {
  const good = contract.endpoints.orders.response.success_example;

  // has_more=false with a non-null next_cursor must fail the contract.
  assert.throws(
    () =>
      parseOrdersListV2Response({
        items: [],
        has_more: false,
        next_cursor: "abc",
      }),
    /orders_invalid_v2_next_cursor_unexpected/,
  );
  // has_more=true without a usable next_cursor must fail the contract.
  assert.throws(
    () =>
      parseOrdersListV2Response({
        items: good.items,
        has_more: true,
        next_cursor: null,
      }),
    /orders_invalid_v2_next_cursor_missing/,
  );
});

test("v2 fetcher: conversations v2 request hits /seller/conversations/v2", async (t) => {
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
  const example = contract.endpoints.conversations.response.success_example;
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    requestedUrl = input instanceof Request ? input.url : String(input);
    requestedInit = init;
    return new Response(JSON.stringify(example), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const conversations = await import("./conversations.ts");
  const page = await conversations.fetchConversationListV2("test-token", {
    attentionOnly: true,
    controlState: "ASSISTANT_PAUSED",
    limit: 20,
    cursor: "opaque-cursor-token",
  });

  assert.equal(
    requestedUrl,
    "https://api.test/seller/conversations/v2?attention_only=true&control_state=ASSISTANT_PAUSED&limit=20&cursor=opaque-cursor-token",
  );
  assert.equal(
    new Headers(requestedInit?.headers).get("Authorization"),
    "Bearer test-token",
  );
  assert.equal(page.hasMore, true);
  assert.equal(page.nextCursor, example.next_cursor);
  assert.equal(page.items[0]?.customer.id, 22);
});
