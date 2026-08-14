/**
 * Presentation / selection / copy tests for Seller Products.
 *
 *   node --test src/lib/seller/products-format.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { Product } from "./products.ts";
import {
  classifyProductsMutationFailure,
  FIELD_OPTIONAL_HELP,
  getFieldRequiredLabel,
  getFieldTypeLabel,
  getProductStatusLabel,
  isProductDuplicateConflict,
  normalizeProductIdParam,
  PRODUCT_DEACTIVATE_EXPLANATION,
  PRODUCT_FIELD_TYPE_LABELS,
  PRODUCTS_EMPTY_TITLE,
  PRODUCTS_FORBIDDEN_DELETE_WORDS,
  PRODUCTS_UNAVAILABLE_DESCRIPTION,
  PRODUCTS_UNAVAILABLE_TITLE,
  productsWorkspaceHref,
  resolveSelectedProduct,
  FIELD_REORDER_CONFLICT_MESSAGE,
  FIELD_REORDER_ERROR_MESSAGE,
  fieldMoveDownLabel,
  fieldMoveUpLabel,
} from "./products-format.ts";

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 12,
  name: "Kupa",
  isActive: true,
  version: 1,
  createdAt: "2026-08-10T12:00:00+00:00",
  updatedAt: "2026-08-10T12:00:00+00:00",
  ...overrides,
});

test("normalizes a positive product query id and rejects junk", () => {
  assert.equal(normalizeProductIdParam("12"), 12);
  assert.equal(normalizeProductIdParam(["8"]), 8);
  assert.equal(normalizeProductIdParam("0"), null);
  assert.equal(normalizeProductIdParam("-3"), null);
  assert.equal(normalizeProductIdParam("12.5"), null);
  assert.equal(normalizeProductIdParam("abc"), null);
  assert.equal(normalizeProductIdParam(undefined), null);
});

test("selected product must exist in the fetched list", () => {
  const products = [
    product({ id: 5, name: "Kupa", isActive: true }),
    product({ id: 8, name: "Termos", isActive: false }),
  ];
  assert.equal(resolveSelectedProduct(products, 8)?.id, 8);
  assert.equal(resolveSelectedProduct(products, 99)?.id, 5);
  assert.equal(resolveSelectedProduct(products, null)?.id, 5);
  assert.equal(
    resolveSelectedProduct(
      [product({ id: 8, isActive: false })],
      null,
    )?.id,
    8,
  );
  assert.equal(resolveSelectedProduct([], 12), null);
});

test("workspace href is URL-owned selection", () => {
  assert.equal(productsWorkspaceHref(12), "/seller/products?product=12");
  assert.equal(productsWorkspaceHref(null), "/seller/products");
  assert.equal(productsWorkspaceHref(), "/seller/products");
});

test("all seven field types have Turkish labels", () => {
  assert.equal(getFieldTypeLabel("short_text"), "Kısa metin");
  assert.equal(getFieldTypeLabel("long_text"), "Uzun metin");
  assert.equal(getFieldTypeLabel("number"), "Sayı");
  assert.equal(getFieldTypeLabel("single_choice"), "Tek seçim");
  assert.equal(getFieldTypeLabel("multi_choice"), "Birden fazla seçim");
  assert.equal(getFieldTypeLabel("boolean"), "Evet / Hayır");
  assert.equal(getFieldTypeLabel("image"), "Görsel");
  assert.equal(Object.keys(PRODUCT_FIELD_TYPE_LABELS).length, 7);
});

test("status and required labels are text, not color-only", () => {
  assert.equal(getProductStatusLabel(true), "Aktif");
  assert.equal(getProductStatusLabel(false), "Devre dışı");
  assert.equal(getFieldRequiredLabel(true), "Zorunlu");
  assert.equal(getFieldRequiredLabel(false), "Opsiyonel");
});

test("optional-field copy does not claim proactive collection", () => {
  assert.match(FIELD_OPTIONAL_HELP, /kendiliğinden sorulmaz/);
  assert.doesNotMatch(FIELD_OPTIONAL_HELP, /asistan.*sorar/i);
});

test("unavailable is not the empty catalog", () => {
  assert.notEqual(PRODUCTS_UNAVAILABLE_TITLE, PRODUCTS_EMPTY_TITLE);
  assert.match(PRODUCTS_UNAVAILABLE_DESCRIPTION, /boş değil/i);
});

test("deactivation copy does not claim deletion", () => {
  assert.match(PRODUCT_DEACTIVATE_EXPLANATION, /yeni siparişlerde seçilmeyecek/i);
  assert.match(PRODUCT_DEACTIVATE_EXPLANATION, /korunur/);
  for (const word of PRODUCTS_FORBIDDEN_DELETE_WORDS) {
    assert.equal(PRODUCT_DEACTIVATE_EXPLANATION.includes(word), false);
  }
});

test("classifies mutation HTTP statuses", () => {
  assert.equal(classifyProductsMutationFailure(409), "conflict");
  assert.equal(classifyProductsMutationFailure(422), "validation");
  assert.equal(classifyProductsMutationFailure(404), "not_found");
  assert.equal(classifyProductsMutationFailure(401), "auth");
  assert.equal(classifyProductsMutationFailure(500), "retryable");
  assert.equal(classifyProductsMutationFailure(null), "retryable");
});

test("detects product duplicate conflict from nested FastAPI detail", () => {
  assert.equal(
    isProductDuplicateConflict({
      detail: {
        code: "seller_product_duplicate_name",
        message: "Bu isimde bir ürün zaten bulunuyor.",
      },
    }),
    true,
  );
  assert.equal(
    isProductDuplicateConflict({ code: "seller_product_conflict" }),
    false,
  );
});

test("Products UI sources never offer a Sil action or catalog extras", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sources = [
    readFileSync(
      path.resolve(dir, "../../components/seller/products/products-workspace.tsx"),
      "utf8",
    ),
    readFileSync(
      path.resolve(dir, "../../components/seller/products/product-dialogs.tsx"),
      "utf8",
    ),
    readFileSync(
      path.resolve(dir, "../../components/seller/products/field-dialogs.tsx"),
      "utf8",
    ),
    readFileSync(
      path.resolve(dir, "../../app/seller/products/page.tsx"),
      "utf8",
    ),
  ].join("\n");
  assert.doesNotMatch(sources, /["']Sil["']/);
  assert.doesNotMatch(sources, /\bSKU\b|\bstok\b|\bfiyat\b|\bprice\b|\bstock\b/i);
  assert.doesNotMatch(sources, /product_id:\s*null/);
});

/* ------------------------------------------------------------------ */
/* Field ordering copy                                                 */
/* ------------------------------------------------------------------ */

test("ordering controls carry explicit accessible names per field", () => {
  assert.equal(fieldMoveUpLabel("Renk"), "Renk alanını yukarı taşı");
  assert.equal(fieldMoveDownLabel("Renk"), "Renk alanını aşağı taşı");
});

test("reorder feedback is calm and never leaks internals", () => {
  assert.equal(
    FIELD_REORDER_ERROR_MESSAGE,
    "Alan sırası güncellenemedi. Güncel sıra yeniden getirildi.",
  );
  assert.equal(
    FIELD_REORDER_CONFLICT_MESSAGE,
    "Alanlar başka bir işlemde değişmiş. Güncel sıra getirildi; tekrar deneyin.",
  );
  for (const message of [
    FIELD_REORDER_ERROR_MESSAGE,
    FIELD_REORDER_CONFLICT_MESSAGE,
  ]) {
    assert.doesNotMatch(message, /409|sort_order|expected_version|HTTP/i);
  }
});
