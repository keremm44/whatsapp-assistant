/**
 * Contract tests for Seller Products + product-specific fields.
 *
 *   node --test src/lib/seller/products.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  nextFieldSortOrder,
  planFieldMove,
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
  parseProductSpecificFieldListResponse,
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

test("product-specific field list requires every row to match the requested product", () => {
  const accepted = parseProductSpecificFieldListResponse(
    { toplam: 1, definitions: [rawField({ product_id: 12 })] },
    12,
  );
  assert.equal(accepted.definitions[0]?.productId, 12);

  assert.throws(
    () =>
      parseProductSpecificFieldListResponse(
        { toplam: 1, definitions: [rawField({ product_id: null })] },
        12,
      ),
    (error: unknown) =>
      error instanceof Error &&
      error.message.startsWith(PRODUCTS_CONTRACT_ERROR_PREFIX),
  );
  assert.throws(
    () =>
      parseProductSpecificFieldListResponse(
        { toplam: 1, definitions: [rawField({ product_id: 13 })] },
        12,
      ),
    (error: unknown) =>
      error instanceof Error &&
      error.message.startsWith(PRODUCTS_CONTRACT_ERROR_PREFIX),
  );
  assert.throws(
    () =>
      parseProductSpecificFieldListResponse(
        {
          toplam: 2,
          definitions: [
            rawField({ id: 44, product_id: 12 }),
            rawField({ id: 45, product_id: null }),
          ],
        },
        12,
      ),
    (error: unknown) =>
      error instanceof Error &&
      error.message.startsWith(PRODUCTS_CONTRACT_ERROR_PREFIX),
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

/* ------------------------------------------------------------------ */
/* Field ordering (sort_order contract)                                */
/* ------------------------------------------------------------------ */

test("field PATCH carries sort_order with the real expected_version", () => {
  const payload = buildUpdateFieldPayload({ version: 3, sortOrder: 2 });
  assert.deepEqual(payload, {
    expected_version: 3,
    sort_order: 2,
  });
  assert.equal(
    fieldPatchHasOnlyMutableKeys(payload as Record<string, unknown>),
    true,
  );
  // Invalid ordering values never reach the wire.
  assert.deepEqual(buildUpdateFieldPayload({ version: 3, sortOrder: -1 }), {
    expected_version: 3,
  });
  assert.deepEqual(buildUpdateFieldPayload({ version: 3, sortOrder: 1.5 }), {
    expected_version: 3,
  });
  // Existing mutable fields still combine unchanged.
  assert.deepEqual(
    buildUpdateFieldPayload({ version: 4, label: " Renk ", sortOrder: 0 }),
    { expected_version: 4, label: "Renk", sort_order: 0 },
  );
});

test("new fields append after the real backend order, not array length", () => {
  const defs = (orders: number[]) => orders.map((sortOrder) => ({ sortOrder }));
  assert.equal(nextFieldSortOrder([]), 0);
  assert.equal(nextFieldSortOrder(defs([0])), 1);
  assert.equal(nextFieldSortOrder(defs([0, 1, 2])), 3);
  // Gapped/legacy values: length (3) would collide inside the order.
  assert.equal(nextFieldSortOrder(defs([0, 5, 12])), 13);
  // Order of appearance is irrelevant; only the max matters.
  assert.equal(nextFieldSortOrder(defs([12, 0, 5])), 13);
});

const orderedFields = (
  entries: [id: number, version: number, sortOrder: number][],
) =>
  entries.map(([id, version, sortOrder]) => ({ id, version, sortOrder }));

test("boundaries cannot move: first up, last down, unknown id", () => {
  const fields = orderedFields([
    [10, 1, 0],
    [11, 2, 1],
    [12, 3, 2],
  ]);
  assert.deepEqual(planFieldMove(fields, 10, "up"), { kind: "none" });
  assert.deepEqual(planFieldMove(fields, 12, "down"), { kind: "none" });
  assert.deepEqual(planFieldMove(fields, 99, "up"), { kind: "none" });
  assert.deepEqual(planFieldMove([], 10, "up"), { kind: "none" });
});

test("an adjacent move swaps the two records' sort_order values", () => {
  const fields = orderedFields([
    [10, 1, 0], // İsim
    [11, 2, 1], // Renk
    [12, 3, 2], // Görsel
  ]);
  // Down on İsim: İsim ↔ Renk exchange positions.
  assert.deepEqual(planFieldMove(fields, 10, "down"), {
    kind: "swap",
    writes: [
      { fieldId: 11, version: 2, sortOrder: 0 },
      { fieldId: 10, version: 1, sortOrder: 1 },
    ],
    rollback: { fieldId: 11, sortOrder: 1 },
  });
  // Up on Görsel: Renk ↔ Görsel exchange positions.
  assert.deepEqual(planFieldMove(fields, 12, "up"), {
    kind: "swap",
    writes: [
      { fieldId: 12, version: 3, sortOrder: 1 },
      { fieldId: 11, version: 2, sortOrder: 2 },
    ],
    rollback: { fieldId: 12, sortOrder: 2 },
  });
});

test("adjacency follows the backend array order, not sortOrder ± 1", () => {
  // Gapped legacy values: neighbors are array neighbors.
  const fields = orderedFields([
    [10, 1, 0],
    [11, 2, 5],
    [12, 3, 12],
  ]);
  assert.deepEqual(planFieldMove(fields, 12, "up"), {
    kind: "swap",
    writes: [
      { fieldId: 12, version: 3, sortOrder: 5 },
      { fieldId: 11, version: 2, sortOrder: 12 },
    ],
    rollback: { fieldId: 12, sortOrder: 12 },
  });
});

test("duplicate sort values fall back to an honest renumber plan", () => {
  // Ties are broken by id ASC in the backend, so exchanging equal
  // values could never express the move — the plan renumbers the
  // desired order as sort_order = index, skipping already-correct
  // records.
  const fields = orderedFields([
    [10, 1, 0],
    [11, 2, 1],
    [12, 3, 1], // duplicate of its neighbor
  ]);
  assert.deepEqual(planFieldMove(fields, 12, "up"), {
    kind: "renumber",
    writes: [
      // desired order: 10 (idx 0, already 0), 12 (idx 1, stored 1 —
      // already correct, skipped), 11 (idx 2 → the only write).
      { fieldId: 11, version: 2, sortOrder: 2 },
    ],
  });
});

test("a duplicate touching the pair's boundary also renumbers", () => {
  // The record BEFORE the pair shares the pair's lower value: a plain
  // value exchange could jump the moved record past it (id tie), so
  // the plan must renumber instead.
  const fields = orderedFields([
    [10, 1, 1],
    [11, 2, 1],
    [12, 3, 2],
  ]);
  const plan = planFieldMove(fields, 12, "up");
  assert.equal(plan.kind, "renumber");
});
