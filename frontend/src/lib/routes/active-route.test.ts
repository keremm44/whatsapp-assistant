/**
 * Seller route-activation tests (`active-route.ts`).
 *
 * Locks the shared sidebar / tablet / mobile parent rules so the
 * mobile sheet cannot drift into a second, conflicting implementation.
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/routes/active-route.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { activeMobileParent, isSellerItemActive } from "./active-route.ts";

test("/seller lights only Genel and the exact Genel Bakış item", () => {
  assert.equal(activeMobileParent("/seller"), "Genel");
  assert.equal(isSellerItemActive("/seller", "/seller"), true);
  assert.equal(isSellerItemActive("/seller", "/seller/conversations"), false);
  assert.equal(isSellerItemActive("/seller", "/seller/orders"), false);
});

test("Conversations lights only the Konuşmalar parent", () => {
  assert.equal(activeMobileParent("/seller/conversations"), "Konuşmalar");
  assert.equal(activeMobileParent("/seller/conversations/22"), "Konuşmalar");
  assert.equal(isSellerItemActive("/seller/conversations", "/seller"), false);
  assert.equal(
    isSellerItemActive("/seller/conversations", "/seller/conversations"),
    true,
  );
});

test("Orders / Returns / Paused / Unanswered light the İşler parent", () => {
  for (const path of [
    "/seller/orders",
    "/seller/orders?view=collecting",
    "/seller/returns",
    "/seller/returns?request=41",
    "/seller/paused",
    "/seller/unanswered",
    "/seller/unanswered?question=17",
  ]) {
    const pathname = path.split("?")[0] ?? path;
    assert.equal(activeMobileParent(pathname), "İşler", pathname);
  }
});

test("/seller/assistant-settings lights Diğer and Asistan Ayarları", () => {
  assert.equal(activeMobileParent("/seller/assistant-settings"), "Diğer");
  assert.equal(
    isSellerItemActive("/seller/assistant-settings", "/seller/assistant-settings"),
    true,
  );
  assert.equal(
    isSellerItemActive("/seller/assistant-settings", "/seller/settings"),
    false,
  );
});

test("/seller/products keeps Asistan Ayarları active inside Diğer", () => {
  assert.equal(activeMobileParent("/seller/products"), "Diğer");
  assert.equal(
    isSellerItemActive("/seller/products", "/seller/assistant-settings"),
    true,
  );
  assert.equal(isSellerItemActive("/seller/products", "/seller/settings"), false);
  assert.equal(isSellerItemActive("/seller/products", "/seller"), false);
});

test("/seller/rules keeps Asistan Ayarları active inside Diğer", () => {
  assert.equal(activeMobileParent("/seller/rules"), "Diğer");
  assert.equal(
    isSellerItemActive("/seller/rules", "/seller/assistant-settings"),
    true,
  );
  assert.equal(isSellerItemActive("/seller/rules", "/seller/settings"), false);
});

test("/seller/assistant-knowledge keeps Asistan Ayarları active inside Diğer", () => {
  assert.equal(activeMobileParent("/seller/assistant-knowledge"), "Diğer");
  assert.equal(
    isSellerItemActive("/seller/assistant-knowledge", "/seller/assistant-settings"),
    true,
  );
  assert.equal(
    isSellerItemActive("/seller/assistant-knowledge", "/seller/settings"),
    false,
  );
});

test("/seller/order-collection keeps Asistan Ayarları active inside Diğer", () => {
  assert.equal(activeMobileParent("/seller/order-collection"), "Diğer");
  assert.equal(
    isSellerItemActive("/seller/order-collection", "/seller/assistant-settings"),
    true,
  );
  assert.equal(
    isSellerItemActive("/seller/order-collection", "/seller/settings"),
    false,
  );
});

test("/seller/settings lights Diğer and the Ayarlar row only", () => {
  assert.equal(activeMobileParent("/seller/settings"), "Diğer");
  assert.equal(isSellerItemActive("/seller/settings", "/seller/settings"), true);
  assert.equal(
    isSellerItemActive("/seller/settings", "/seller/assistant-settings"),
    false,
  );
});

test("prefix matching does not let /seller swallow child routes", () => {
  assert.equal(isSellerItemActive("/seller/orders", "/seller"), false);
  assert.equal(activeMobileParent("/seller/orders"), "İşler");
});
