/**
 * Contract tests for Seller Products + product-specific fields.
 *
 *   node --test src/lib/seller/products.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildChoiceOptions,
  buildCreateFieldPayload,
  buildCreateProductPayload,
  buildProductStatusPayload,
  buildRenameProductPayload,
  buildUpdateFieldPayload,
  choiceLabelsAreValid,
  FIELD_IMMUTABLE_PATCH_KEYS,
  fieldPatchHasOnlyMutableKeys,
  generateFieldKey,
  parseProductFieldDefinitionResponse,
  parseProductFieldListResponse,
  parseProductListResponse,
  parseProductMutationResponse,
  PRODUCTS_CONTRACT_ERROR_PREFIX,
  PRODUCT_FIELD_TYPES,
} from "./products.ts";

const rawProduct = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 12,
  name: "Kupa",
  is_active: true,
  version: 3,
  created_at: "2026-08-10T12:00:00+00:00",
  updated_at: "2026-08-10T12:05:00+00:00",
  ...overrides,
});

const rawField = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 44,
  product_id: 12,
  field_key: "p12_kupaya_yazilacak_isim",
  label: "Kupaya yazılacak isim",
  field_type: "short_text",
  is_required: true,
  is_active: true,
  sort_order: 0,
  options: [],
  validation_config: {},
  version: 1,
  created_at: "2026-08-10T12:00:00+00:00",
  updated_at: "2026-08-10T12:00:00+00:00",
  ...overrides,
});

test("parses a valid product list including inactive rows", () => {
  const page = parseProductListResponse({
    products: [
      rawProduct(),
      rawProduct({ id: 13, name: "Termos", is_active: false, version: 1 }),
    ],
    total: 2,
  });
  assert.equal(page.total, 2);
  assert.equal(page.products[0]?.name, "Kupa");
  assert.equal(page.products[0]?.isActive, true);
  assert.equal(page.products[1]?.isActive, false);
  assert.equal(page.products[0]?.version, 3);
});

test("rejects a malformed product payload", () => {
  const bad: unknown[] = [
    "nope",
    { total: 0 },
    { products: {}, total: 0 },
    { products: [rawProduct({ id: 0 })], total: 1 },
    { products: [rawProduct({ name: 5 })], total: 1 },
    { products: [rawProduct({ is_active: "yes" })], total: 1 },
    { products: [rawProduct({ version: 0 })], total: 1 },
    { products: [rawProduct()], total: -1 },
  ];
  for (const payload of bad) {
    assert.throws(
      () => parseProductListResponse(payload),
      (error: unknown) =>
        error instanceof Error &&
        error.message.startsWith(PRODUCTS_CONTRACT_ERROR_PREFIX),
    );
  }
});

test("parses create/update product mutation envelopes", () => {
  const created = parseProductMutationResponse({
    changed: true,
    product: rawProduct({ id: 21, version: 1 }),
  });
  assert.equal(created.changed, true);
  assert.equal(created.product.id, 21);
  assert.throws(() =>
    parseProductMutationResponse({ product: rawProduct() }),
  );
});

test("create/rename/status payloads use the exact backend shape", () => {
  assert.deepEqual(buildCreateProductPayload("  Kupa  "), { name: "Kupa" });
  assert.deepEqual(buildRenameProductPayload({ version: 3, name: " Yeni " }), {
    expected_version: 3,
    name: "Yeni",
  });
  assert.deepEqual(
    buildProductStatusPayload({ version: 4, isActive: false }),
    { expected_version: 4, is_active: false },
  );
  assert.deepEqual(
    buildProductStatusPayload({ version: 4, isActive: true }),
    { expected_version: 4, is_active: true },
  );
});

test("parses field definitions and rejects unsupported types/options", () => {
  const page = parseProductFieldListResponse({
    toplam: 1,
    definitions: [
      rawField({
        field_type: "single_choice",
        options: [
          { value: "opt_1", label: "Kırmızı" },
          { value: "opt_2", label: "Siyah" },
        ],
      }),
    ],
  });
  assert.equal(page.pageCount, 1);
  assert.equal(page.definitions[0]?.fieldType, "single_choice");
  assert.equal(page.definitions[0]?.options[0]?.label, "Kırmızı");

  assert.throws(() =>
    parseProductFieldListResponse({
      toplam: 1,
      definitions: [rawField({ field_type: "date" })],
    }),
  );
  assert.throws(() =>
    parseProductFieldListResponse({
      toplam: 1,
      definitions: [rawField({ options: "red" })],
    }),
  );
  assert.throws(() =>
    parseProductFieldListResponse({
      toplam: 1,
      definitions: [rawField({ options: [{ label: "Kırmızı" }] })],
    }),
  );
});

test("parses a field create/update envelope", () => {
  const field = parseProductFieldDefinitionResponse({
    definition: rawField({ version: 2, is_required: false }),
  });
  assert.equal(field.version, 2);
  assert.equal(field.isRequired, false);
  assert.equal(field.productId, 12);
});

test("generates a safe field_key from product id + Turkish label", () => {
  assert.equal(
    generateFieldKey(12, "Kupaya yazılacak isim"),
    "p12_kupaya_yazilacak_isim",
  );
  assert.equal(generateFieldKey(3, "İNCİ KUPA"), "p3_inci_kupa");
  assert.equal(generateFieldKey(3, "!!!"), "p3_alan");
  assert.ok(generateFieldKey(99, "a".repeat(80)).length <= 64);
  assert.match(generateFieldKey(1, "Renk"), /^[a-z]/);
});

test("field create always binds product_id and never seller_id", () => {
  const payload = buildCreateFieldPayload({
    productId: 12,
    label: "Kupaya yazılacak isim",
    fieldType: "short_text",
    isRequired: true,
    sortOrder: 0,
  });
  assert.equal(payload.product_id, 12);
  assert.equal(payload.field_key, "p12_kupaya_yazilacak_isim");
  assert.equal(payload.is_required, true);
  assert.equal("seller_id" in payload, false);
  assert.equal("validation_config" in payload, false);
  assert.equal("options" in payload, false);
});

test("all seven field types can be created", () => {
  for (const fieldType of PRODUCT_FIELD_TYPES) {
    const payload = buildCreateFieldPayload({
      productId: 5,
      label: "Alan",
      fieldType,
      isRequired: true,
      sortOrder: 1,
      optionLabels: ["Bir", "İki"],
    });
    assert.equal(payload.field_type, fieldType);
    assert.equal(payload.product_id, 5);
    if (fieldType === "single_choice" || fieldType === "multi_choice") {
      assert.deepEqual(payload.options, [
        { value: "opt_1", label: "Bir" },
        { value: "opt_2", label: "İki" },
      ]);
    } else {
      assert.equal(payload.options, undefined);
    }
  }
});

test("choice options require two distinct non-empty labels", () => {
  assert.equal(choiceLabelsAreValid(["Kırmızı", "Siyah"]), true);
  assert.equal(choiceLabelsAreValid(["Kırmızı"]), false);
  assert.equal(choiceLabelsAreValid(["Kırmızı", "Kırmızı"]), false);
  assert.equal(choiceLabelsAreValid(["  ", "Siyah"]), false);
  assert.deepEqual(buildChoiceOptions(["  Kırmızı  ", "", "Siyah"]), [
    { value: "opt_1", label: "Kırmızı" },
    { value: "opt_2", label: "Siyah" },
  ]);
});

test("field PATCH sends only mutable properties", () => {
  const payload = buildUpdateFieldPayload({
    version: 2,
    label: "Yeni etiket",
    isRequired: false,
  });
  assert.deepEqual(payload, {
    expected_version: 2,
    label: "Yeni etiket",
    is_required: false,
  });
  assert.equal(
    fieldPatchHasOnlyMutableKeys(payload as Record<string, unknown>),
    true,
  );
  const statusPayload = buildUpdateFieldPayload({
    version: 3,
    isActive: false,
  });
  assert.deepEqual(statusPayload, {
    expected_version: 3,
    is_active: false,
  });
  for (const key of FIELD_IMMUTABLE_PATCH_KEYS) {
    assert.equal(key in payload, false);
    assert.equal(key in statusPayload, false);
  }
});
