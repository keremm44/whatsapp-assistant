import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSellerEntitlements } from "./entitlement-contract.ts";

test("seller entitlement contract preserves backend product order", () => {
  assert.deepEqual(
    parseSellerEntitlements({ products: ["whatsapp", "trendyol"] }),
    { products: ["whatsapp", "trendyol"] },
  );
});

test("seller entitlement contract accepts an empty package set", () => {
  assert.deepEqual(parseSellerEntitlements({ products: [] }), { products: [] });
});

test("seller entitlement contract rejects malformed product keys", () => {
  assert.throws(
    () => parseSellerEntitlements({ products: ["../trendyol"] }),
    /seller_entitlements_invalid_product_key/,
  );
});

test("seller entitlement contract rejects duplicate products", () => {
  assert.throws(
    () => parseSellerEntitlements({ products: ["whatsapp", "whatsapp"] }),
    /seller_entitlements_invalid_duplicate/,
  );
});

test("seller entitlement contract rejects malformed responses", () => {
  assert.throws(
    () => parseSellerEntitlements({ products: "whatsapp" }),
    /seller_entitlements_invalid_response/,
  );
});
