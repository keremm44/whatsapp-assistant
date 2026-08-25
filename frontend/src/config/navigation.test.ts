import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getMobileBottomNav,
  getSellerProductNavigation,
  whatsappMobileBottomNav,
  whatsappNavigation,
} from "./navigation.ts";

test("whatsapp entitlement resolves the current seller navigation", () => {
  const products = getSellerProductNavigation(["whatsapp"]);

  assert.equal(products.length, 1);
  assert.equal(products[0]?.productKey, "whatsapp");
  assert.equal(products[0]?.label, "WhatsApp");
  assert.equal(products[0]?.sections, whatsappNavigation);
  assert.equal(getMobileBottomNav(["whatsapp"]), whatsappMobileBottomNav);
});

test("unknown entitlements never create dead navigation links", () => {
  assert.deepEqual(getSellerProductNavigation(["trendyol"]), []);
  assert.deepEqual(getSellerProductNavigation(["future_product"]), []);
  assert.deepEqual(getMobileBottomNav(["trendyol"]), []);
});

test("combined package does not guess a mobile IA before both products exist", () => {
  const products = getSellerProductNavigation(["whatsapp", "trendyol"]);

  assert.equal(products.length, 1);
  assert.equal(products[0]?.productKey, "whatsapp");
  assert.equal(getMobileBottomNav(["whatsapp", "trendyol"]), whatsappMobileBottomNav);
});

test("no active product renders no product navigation", () => {
  assert.deepEqual(getSellerProductNavigation([]), []);
  assert.deepEqual(getMobileBottomNav([]), []);
});
