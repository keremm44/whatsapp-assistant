/**
 * Sipariş Toplama — copy, payload, and UI invariant tests.
 *
 *   node --test src/lib/seller/order-collection.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildOrderSectionPatch,
  CUSTOM_TEXT_REQUIRED_NEEDS_MAX_MESSAGE,
  QUANTITY_RANGE_MESSAGE,
  validateOrderDraft,
  type OrderSettings,
  type ProductSettings,
} from "./assistant-settings.ts";
import {
  formatBinaryChoiceLabel,
  ORDER_COLLECTION_PAGE_DESCRIPTION,
  ORDER_COLLECTION_PAGE_TITLE,
  ORDER_CUSTOM_TEXT_REQUIRED_HELP,
  ORDER_IMAGE_REQUIRED_HELP,
  ORDER_IMAGE_REQUIRED_LABEL,
  ORDER_KNOWLEDGE_HREF,
  ORDER_KNOWLEDGE_LINK_LABEL,
  ORDER_MAX_QUANTITY_LABEL,
  ORDER_MIN_QUANTITY_LABEL,
  ORDER_PRODUCT_FIELDS_DESCRIPTION,
  ORDER_PRODUCTS_HREF,
  ORDER_PRODUCTS_LINK_LABEL,
  SETTINGS_UNSPECIFIED_LABEL,
} from "./assistant-settings-format.ts";

const currentOrder = (
  overrides: Partial<OrderSettings> = {},
): OrderSettings => ({
  minQuantity: 1,
  maxQuantity: 20,
  imageRequired: true,
  customTextRequired: false,
  ...overrides,
});

const currentProduct = (
  overrides: Partial<ProductSettings> = {},
): ProductSettings => ({
  material: "Seramik",
  sizeMl: 330,
  printMethod: "Süblimasyon",
  customTextMaxLength: 50,
  ...overrides,
});

test("quantity labels and max >= min validation", () => {
  assert.equal(ORDER_MIN_QUANTITY_LABEL, "Minimum sipariş adedi");
  assert.equal(ORDER_MAX_QUANTITY_LABEL, "Maksimum sipariş adedi");
  const issues = validateOrderDraft(
    currentOrder({ minQuantity: 8, maxQuantity: 3 }),
    currentOrder(),
    currentProduct(),
  );
  assert.ok(issues.some((issue) => issue.message === QUANTITY_RANGE_MESSAGE));
  assert.equal(
    validateOrderDraft(
      currentOrder({ minQuantity: 2, maxQuantity: 8 }),
      currentOrder(),
      currentProduct(),
    ).length,
    0,
  );
});

test("image required true/false and null stays unknown", () => {
  assert.equal(ORDER_IMAGE_REQUIRED_LABEL, "Siparişte görsel iste");
  assert.match(ORDER_IMAGE_REQUIRED_HELP, /müşteriden görsel ister/);
  assert.doesNotMatch(ORDER_IMAGE_REQUIRED_HELP, /katalog|iade|kanıt/i);
  assert.equal(formatBinaryChoiceLabel(null), SETTINGS_UNSPECIFIED_LABEL);
  assert.equal(formatBinaryChoiceLabel(true), "Evet");
  assert.equal(formatBinaryChoiceLabel(false), "Hayır");

  const toFalse = buildOrderSectionPatch({
    expectedVersion: 4,
    current: currentOrder({ imageRequired: true }),
    draft: currentOrder({ imageRequired: false }),
  });
  assert.deepEqual(toFalse, {
    expected_version: 4,
    order: { image_required: false },
  });

  const fromUnknown = buildOrderSectionPatch({
    expectedVersion: 4,
    current: currentOrder({ imageRequired: null }),
    draft: currentOrder({ imageRequired: true }),
  });
  assert.deepEqual(fromUnknown, {
    expected_version: 4,
    order: { image_required: true },
  });
});

test("custom text depends on product max length and links to knowledge", () => {
  assert.equal(ORDER_KNOWLEDGE_HREF, "/seller/assistant-knowledge");
  assert.equal(ORDER_KNOWLEDGE_LINK_LABEL, "Asistanın Bildikleri bölümüne git");
  assert.match(ORDER_CUSTOM_TEXT_REQUIRED_HELP, /özel yazı ister/);

  const blocked = validateOrderDraft(
    currentOrder({ customTextRequired: true }),
    currentOrder({ customTextRequired: false }),
    currentProduct({ customTextMaxLength: null }),
  );
  assert.ok(
    blocked.some((issue) => issue.message === CUSTOM_TEXT_REQUIRED_NEEDS_MAX_MESSAGE),
  );

  const allowed = validateOrderDraft(
    currentOrder({ customTextRequired: true }),
    currentOrder({ customTextRequired: false }),
    currentProduct({ customTextMaxLength: 40 }),
  );
  assert.equal(allowed.length, 0);

  const disable = buildOrderSectionPatch({
    expectedVersion: 6,
    current: currentOrder({ customTextRequired: true }),
    draft: currentOrder({ customTextRequired: false }),
  });
  assert.deepEqual(disable, {
    expected_version: 6,
    order: { custom_text_required: false },
  });
});

test("products cross-link exists and does not host a field editor", () => {
  assert.equal(ORDER_PRODUCTS_HREF, "/seller/products");
  assert.equal(ORDER_PRODUCTS_LINK_LABEL, "Ürünlere git");
  assert.match(ORDER_PRODUCT_FIELDS_DESCRIPTION, /ürün bazında/);
});

test("order patch sends only the order section and expected_version", () => {
  const payload = buildOrderSectionPatch({
    expectedVersion: 12,
    current: currentOrder(),
    draft: currentOrder({ minQuantity: 2, imageRequired: false }),
  });
  assert.deepEqual(payload, {
    expected_version: 12,
    order: { min_quantity: 2, image_required: false },
  });
  assert.equal(payload && "product" in payload, false);
  assert.equal(payload && "usage" in payload, false);
  assert.equal(payload && "shipping" in payload, false);
});

test("Sipariş Toplama page copy stays practical", () => {
  assert.equal(ORDER_COLLECTION_PAGE_TITLE, "Sipariş Toplama");
  assert.match(ORDER_COLLECTION_PAGE_DESCRIPTION, /temel bilgileri/);
  assert.doesNotMatch(
    ORDER_COLLECTION_PAGE_DESCRIPTION,
    /knowledge base|eğitim|öğren|MOQ|stok/i,
  );
});

test("order collection UI has cross-links and no personalization editor", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sources = [
    readFileSync(
      path.resolve(dir, "../../app/seller/order-collection/page.tsx"),
      "utf8",
    ),
    readFileSync(
      path.resolve(
        dir,
        "../../components/seller/assistant-settings/order-collection-workspace.tsx",
      ),
      "utf8",
    ),
  ].join("\n");
  assert.match(sources, /ORDER_KNOWLEDGE_HREF|assistant-knowledge/);
  assert.match(sources, /ORDER_PRODUCTS_HREF|\/seller\/products/);
  assert.match(sources, /ORDER_KNOWLEDGE_LINK_LABEL/);
  assert.match(sources, /ORDER_PRODUCTS_LINK_LABEL/);
  assert.doesNotMatch(sources, /field_type|validation_config|Bilgi alanı ekle/);
  assert.doesNotMatch(sources, /product:\s*\{/);
  assert.doesNotMatch(sources, /MOQ|stok|fiyat|SKU/i);
  assert.doesNotMatch(sources, /Temizle|Belirtilmedi yap/);
});
