/**
 * Public seller application tests (`seller-application.ts`).
 *
 * Runs with Node's built-in test runner:
 *   node --test src/lib/marketing/seller-application.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSellerApplicationPayload,
  normalizeApplicationPhone,
  parseSellerApplicationResponse,
  validateSellerApplication,
} from "./seller-application.ts";

test("phone normalization mirrors the backend 05xx / 5xx folding", () => {
  assert.equal(normalizeApplicationPhone("0532 111 22 33"), "+905321112233");
  assert.equal(normalizeApplicationPhone("5321112233"), "+905321112233");
  assert.equal(normalizeApplicationPhone("+1 202 555 0147"), "+12025550147");
});

test("required fields and phone digits are validated calmly", () => {
  const { errors } = validateSellerApplication({
    fullName: "A",
    storeName: "B",
    phone: "12",
  });
  assert.equal(errors.fullName, "Ad soyad zorunludur.");
  assert.equal(errors.storeName, "Mağaza adı zorunludur.");
  assert.equal(errors.phone, "Geçerli bir telefon numarası girilmelidir.");
});

test("optional fields are trimmed, validated and normalized to undefined when empty", () => {
  const { errors, normalized } = validateSellerApplication({
    fullName: "  Elif Kaya  ",
    storeName: "Kupa Dükkanı",
    phone: "05321112233",
    email: "  elif@example.com  ",
    productCategory: "  Seramik kupa  ",
    storeLink: "https://dukkanim.com",
    notes: "   ",
  });
  assert.deepEqual(errors, {});
  assert.equal(normalized.fullName, "Elif Kaya");
  assert.equal(normalized.email, "elif@example.com");
  assert.equal(normalized.productCategory, "Seramik kupa");
  assert.equal(normalized.notes, undefined);
  assert.equal(normalized.phone, "+905321112233");
});

test("invalid email and non-http store link are rejected", () => {
  const { errors } = validateSellerApplication({
    fullName: "Elif Kaya",
    storeName: "Kupa Dükkanı",
    phone: "05321112233",
    email: "elif",
    storeLink: "dukkanim.com",
  });
  assert.equal(errors.email, "Geçerli bir e-posta adresi girin.");
  assert.equal(
    errors.storeLink,
    "Geçerli bir http veya https bağlantısı girilmelidir.",
  );
});

test("payload uses backend snake_case fields and omits empty optionals", () => {
  const payload = buildSellerApplicationPayload({
    fullName: "Elif Kaya",
    storeName: "Kupa Dükkanı",
    phone: "+905321112233",
    email: "elif@example.com",
    notes: "Mevcut siparişleri elden yönetiyorum.",
  });
  assert.deepEqual(payload, {
    full_name: "Elif Kaya",
    store_name: "Kupa Dükkanı",
    phone: "+905321112233",
    email: "elif@example.com",
    notes: "Mevcut siparişleri elden yönetiyorum.",
  });
});

test("response parser accepts only the real backend success shape", () => {
  assert.deepEqual(
    parseSellerApplicationResponse({
      received: true,
      message: "Başvurunuz alındı.",
    }),
    { received: true, message: "Başvurunuz alındı." },
  );

  assert.throws(() => parseSellerApplicationResponse({ received: false }), /invalid_response/);
  assert.throws(() => parseSellerApplicationResponse({ message: "x" }), /invalid_response/);
  assert.throws(() => parseSellerApplicationResponse(null), /invalid_response/);
});
