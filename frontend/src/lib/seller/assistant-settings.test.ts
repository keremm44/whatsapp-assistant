/**
 * Contract tests for seller settings GET/PATCH.
 *
 *   node --test src/lib/seller/assistant-settings.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyReturnsDisabledClear,
  buildOrderSectionPatch,
  buildProductSectionPatch,
  buildReturnPolicySectionPatch,
  buildShippingSectionPatch,
  buildUsageSectionPatch,
  CUSTOM_TEXT_MAX_REQUIRED_MESSAGE,
  CUSTOM_TEXT_REQUIRED_NEEDS_MAX_MESSAGE,
  isNullClearAllowed,
  NULL_CLEARABLE_FIELDS,
  parseSellerSettingsResponse,
  patchSectionKeys,
  QUANTITY_RANGE_MESSAGE,
  RETURNS_TRUE_NEEDS_PERIOD_MESSAGE,
  SAME_DAY_MIN_ZERO_MESSAGE,
  sectionHasChanges,
  SETTINGS_CONTRACT_ERROR_PREFIX,
  SHIPPING_RANGE_MESSAGE,
  validateOrderDraft,
  validateProductDraft,
  validateReturnPolicyDraft,
  validateShippingDraft,
  type OrderSettings,
  type ProductSettings,
  type ReturnPolicySettings,
  type SellerSettings,
  type ShippingSettings,
  type UsageSettings,
} from "./assistant-settings.ts";

const fullSettings = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  version: 4,
  updated_at: "2026-08-10T12:00:00+00:00",
  business: {
    name: "Alya",
    phone: "+905551234567",
    store_name: "Alya Atölye",
    store_link: "https://example.com",
  },
  product: {
    material: "Seramik",
    size_ml: 330,
    print_method: "Süblimasyon",
    custom_text_max_length: 50,
  },
  order: {
    min_quantity: 1,
    max_quantity: 20,
    image_required: true,
    custom_text_required: true,
  },
  usage: {
    microwave_safe: true,
    dishwasher_safe: false,
    hand_wash_recommended: true,
    food_safe: true,
  },
  shipping: {
    processing_days_min: 1,
    processing_days_max: 2,
    same_day_available: false,
    company: "Yurtiçi",
    international: false,
  },
  return_policy: {
    accepts_returns: true,
    return_period_days: 14,
    damage_replacement: true,
    wrong_print_replacement: true,
  },
  ...overrides,
});

const parsedProduct = (
  overrides: Partial<ProductSettings> = {},
): ProductSettings => ({
  material: "Seramik",
  sizeMl: 330,
  printMethod: "Süblimasyon",
  customTextMaxLength: 50,
  ...overrides,
});

const parsedOrder = (overrides: Partial<OrderSettings> = {}): OrderSettings => ({
  minQuantity: 1,
  maxQuantity: 20,
  imageRequired: true,
  customTextRequired: true,
  ...overrides,
});

const parsedUsage = (overrides: Partial<UsageSettings> = {}): UsageSettings => ({
  microwaveSafe: true,
  dishwasherSafe: false,
  handWashRecommended: true,
  foodSafe: true,
  ...overrides,
});

const parsedShipping = (
  overrides: Partial<ShippingSettings> = {},
): ShippingSettings => ({
  processingDaysMin: 1,
  processingDaysMax: 2,
  sameDayAvailable: false,
  company: "Yurtiçi",
  international: false,
  ...overrides,
});

const parsedReturns = (
  overrides: Partial<ReturnPolicySettings> = {},
): ReturnPolicySettings => ({
  acceptsReturns: true,
  returnPeriodDays: 14,
  damageReplacement: true,
  wrongPrintReplacement: true,
  ...overrides,
});

test("parses a full settings payload and keeps false distinct from null", () => {
  const settings = parseSellerSettingsResponse({ settings: fullSettings() });
  assert.equal(settings.version, 4);
  assert.equal(settings.product.material, "Seramik");
  assert.equal(settings.product.sizeMl, 330);
  assert.equal(settings.usage.dishwasherSafe, false);
  assert.equal(settings.shipping.sameDayAvailable, false);
  assert.equal(settings.order.imageRequired, true);
  assert.equal(settings.returnPolicy.returnPeriodDays, 14);
  assert.equal(settings.business.storeName, "Alya Atölye");
});

test("accepts the service envelope with ok:true", () => {
  const settings = parseSellerSettingsResponse({
    ok: true,
    settings: fullSettings({ version: 7 }),
  });
  assert.equal(settings.version, 7);
});

test("accepts sparse settings and normalizes missing fields to null", () => {
  const settings = parseSellerSettingsResponse({
    settings: { version: 1 },
  });
  assert.equal(settings.version, 1);
  assert.equal(settings.updatedAt, null);
  assert.equal(settings.product.material, null);
  assert.equal(settings.product.sizeMl, null);
  assert.equal(settings.product.printMethod, null);
  assert.equal(settings.product.customTextMaxLength, null);
  assert.equal(settings.order.minQuantity, null);
  assert.equal(settings.order.maxQuantity, null);
  assert.equal(settings.order.imageRequired, null);
  assert.equal(settings.order.customTextRequired, null);
  assert.equal(settings.usage.microwaveSafe, null);
  assert.equal(settings.usage.dishwasherSafe, null);
  assert.equal(settings.shipping.sameDayAvailable, null);
  assert.equal(settings.shipping.company, null);
  assert.equal(settings.returnPolicy.acceptsReturns, null);
  assert.equal(settings.returnPolicy.returnPeriodDays, null);
});

test("missing boolean stays null and is not coerced to false", () => {
  const settings = parseSellerSettingsResponse({
    settings: {
      version: 2,
      usage: { microwave_safe: true },
      order: { min_quantity: 1 },
    },
  });
  assert.equal(settings.usage.microwaveSafe, true);
  assert.equal(settings.usage.dishwasherSafe, null);
  assert.equal(settings.usage.foodSafe, null);
  assert.equal(settings.order.imageRequired, null);
  assert.equal(settings.order.customTextRequired, null);
});

test("explicit false is preserved", () => {
  const settings = parseSellerSettingsResponse({
    settings: {
      version: 2,
      usage: { dishwasher_safe: false, food_safe: false },
      order: { image_required: false, custom_text_required: false },
      shipping: { same_day_available: false, international: false },
      return_policy: { accepts_returns: false },
    },
  });
  assert.equal(settings.usage.dishwasherSafe, false);
  assert.equal(settings.usage.foodSafe, false);
  assert.equal(settings.order.imageRequired, false);
  assert.equal(settings.order.customTextRequired, false);
  assert.equal(settings.shipping.sameDayAvailable, false);
  assert.equal(settings.returnPolicy.acceptsReturns, false);
});

test("rejects malformed settings payloads", () => {
  const bad: unknown[] = [
    "nope",
    {},
    { ok: false, settings: fullSettings() },
    { settings: { version: 0 } },
    { settings: { version: 1.5 } },
    { settings: { version: "3" } },
    { settings: { version: 1, product: [] } },
    { settings: { version: 1, usage: { dishwasher_safe: "no" } } },
    { settings: { version: 1, product: { size_ml: 330.5 } } },
    { settings: { version: 1, order: { image_required: 1 } } },
    { settings: { version: 1, updated_at: 12 } },
  ];
  for (const payload of bad) {
    assert.throws(
      () => parseSellerSettingsResponse(payload),
      (error: unknown) =>
        error instanceof Error &&
        error.message.startsWith(SETTINGS_CONTRACT_ERROR_PREFIX),
    );
  }
});

test("section patch sends only changed fields and expected_version", () => {
  const payload = buildProductSectionPatch({
    expectedVersion: 4,
    current: parsedProduct(),
    draft: parsedProduct({ material: "Porselen", sizeMl: 330 }),
  });
  assert.deepEqual(payload, {
    expected_version: 4,
    product: { material: "Porselen" },
  });
  assert.deepEqual(patchSectionKeys(payload!), ["product"]);
  assert.equal(payload && "order" in payload, false);
  assert.equal(payload && "usage" in payload, false);
});

test("unchanged section returns null rather than an empty patch", () => {
  assert.equal(
    buildProductSectionPatch({
      expectedVersion: 4,
      current: parsedProduct(),
      draft: parsedProduct(),
    }),
    null,
  );
});

test("custom_text_max_length may send explicit null", () => {
  const payload = buildProductSectionPatch({
    expectedVersion: 5,
    current: parsedProduct(),
    draft: parsedProduct({ customTextMaxLength: null }),
  });
  assert.deepEqual(payload, {
    expected_version: 5,
    product: { custom_text_max_length: null },
  });
});

test("material/size/print cannot send null", () => {
  assert.throws(() =>
    buildProductSectionPatch({
      expectedVersion: 5,
      current: parsedProduct(),
      draft: parsedProduct({ material: null }),
    }),
  );
  assert.throws(() =>
    buildProductSectionPatch({
      expectedVersion: 5,
      current: parsedProduct(),
      draft: parsedProduct({ sizeMl: null }),
    }),
  );
  assert.throws(() =>
    buildProductSectionPatch({
      expectedVersion: 5,
      current: parsedProduct(),
      draft: parsedProduct({ printMethod: null }),
    }),
  );
});

test("usage patch can send true, false, and null", () => {
  const payload = buildUsageSectionPatch({
    expectedVersion: 6,
    current: parsedUsage(),
    draft: parsedUsage({
      dishwasherSafe: true,
      foodSafe: null,
      microwaveSafe: true,
    }),
  });
  assert.deepEqual(payload, {
    expected_version: 6,
    usage: { dishwasher_safe: true, food_safe: null },
  });
});

test("shipping never sends null on write", () => {
  assert.throws(() =>
    buildShippingSectionPatch({
      expectedVersion: 3,
      current: parsedShipping(),
      draft: parsedShipping({ company: null }),
    }),
  );
  assert.throws(() =>
    buildShippingSectionPatch({
      expectedVersion: 3,
      current: parsedShipping(),
      draft: parsedShipping({ sameDayAvailable: null }),
    }),
  );
  const payload = buildShippingSectionPatch({
    expectedVersion: 3,
    current: parsedShipping({ company: null, sameDayAvailable: null }),
    draft: parsedShipping({ company: "MNG", sameDayAvailable: false }),
  });
  assert.deepEqual(payload, {
    expected_version: 3,
    shipping: { same_day_available: false, company: "MNG" },
  });
});

test("returns false with a positive period produces an explicit null clear", () => {
  const draft = applyReturnsDisabledClear(
    parsedReturns({ acceptsReturns: false, returnPeriodDays: 14 }),
  );
  assert.equal(draft.returnPeriodDays, null);
  const payload = buildReturnPolicySectionPatch({
    expectedVersion: 8,
    current: parsedReturns(),
    draft,
  });
  assert.deepEqual(payload, {
    expected_version: 8,
    return_policy: {
      accepts_returns: false,
      return_period_days: null,
    },
  });
});

test("return_period_days may be null and the three booleans may not", () => {
  assert.equal(isNullClearAllowed("return_policy", "return_period_days"), true);
  assert.equal(isNullClearAllowed("return_policy", "accepts_returns"), false);
  assert.throws(() =>
    buildReturnPolicySectionPatch({
      expectedVersion: 2,
      current: parsedReturns(),
      draft: parsedReturns({ acceptsReturns: null }),
    }),
  );
});

test("order patch sends only changed order fields", () => {
  const payload = buildOrderSectionPatch({
    expectedVersion: 9,
    current: parsedOrder(),
    draft: parsedOrder({ imageRequired: false, minQuantity: 1 }),
  });
  assert.deepEqual(payload, {
    expected_version: 9,
    order: { image_required: false },
  });
  assert.equal(payload && "product" in payload, false);
});

test("order max_quantity may send null; other order fields may not", () => {
  assert.equal(isNullClearAllowed("order", "max_quantity"), true);
  assert.equal(isNullClearAllowed("order", "min_quantity"), false);
  assert.equal(isNullClearAllowed("order", "image_required"), false);
  const payload = buildOrderSectionPatch({
    expectedVersion: 9,
    current: parsedOrder(),
    draft: parsedOrder({ maxQuantity: null }),
  });
  assert.deepEqual(payload, {
    expected_version: 9,
    order: { max_quantity: null },
  });
  assert.throws(() =>
    buildOrderSectionPatch({
      expectedVersion: 9,
      current: parsedOrder(),
      draft: parsedOrder({ imageRequired: null }),
    }),
  );
});

test("null-clear allowlist matches the backend write contract", () => {
  assert.deepEqual(NULL_CLEARABLE_FIELDS.product, ["custom_text_max_length"]);
  assert.deepEqual(NULL_CLEARABLE_FIELDS.usage, [
    "microwave_safe",
    "dishwasher_safe",
    "hand_wash_recommended",
    "food_safe",
  ]);
  assert.deepEqual(NULL_CLEARABLE_FIELDS.shipping, []);
  assert.equal(isNullClearAllowed("product", "material"), false);
  assert.equal(isNullClearAllowed("shipping", "company"), false);
});

test("product validation blocks clearing max length when custom text is required", () => {
  const issues = validateProductDraft(
    parsedProduct({ customTextMaxLength: null }),
    parsedProduct(),
    parsedOrder({ customTextRequired: true }),
  );
  assert.equal(issues[0]?.field, "custom_text_max_length");
  assert.equal(issues[0]?.message, CUSTOM_TEXT_MAX_REQUIRED_MESSAGE);
});

test("product validation allows clearing max length when custom text is not required", () => {
  const issues = validateProductDraft(
    parsedProduct({ customTextMaxLength: null }),
    parsedProduct(),
    parsedOrder({ customTextRequired: false }),
  );
  assert.equal(issues.length, 0);
});

test("shipping validation enforces range and same-day invariants", () => {
  const range = validateShippingDraft(
    parsedShipping({ processingDaysMax: 0 }),
    parsedShipping(),
  );
  assert.ok(range.some((issue) => issue.message === SHIPPING_RANGE_MESSAGE));

  const sameDay = validateShippingDraft(
    parsedShipping({ sameDayAvailable: true }),
    parsedShipping(),
  );
  assert.ok(sameDay.some((issue) => issue.message === SAME_DAY_MIN_ZERO_MESSAGE));

  const ok = validateShippingDraft(
    parsedShipping({ sameDayAvailable: true, processingDaysMin: 0 }),
    parsedShipping(),
  );
  assert.equal(ok.length, 0);
});

test("returns true requires a valid period", () => {
  const issues = validateReturnPolicyDraft(
    parsedReturns({ acceptsReturns: true, returnPeriodDays: 0 }),
    parsedReturns({ acceptsReturns: false, returnPeriodDays: 0 }),
  );
  assert.ok(
    issues.some((issue) => issue.message === RETURNS_TRUE_NEEDS_PERIOD_MESSAGE),
  );
});

test("order validation enforces max >= min and custom-text dependency", () => {
  const range = validateOrderDraft(
    parsedOrder({ minQuantity: 30 }),
    parsedOrder(),
    parsedProduct(),
  );
  assert.ok(range.some((issue) => issue.message === QUANTITY_RANGE_MESSAGE));

  const customText = validateOrderDraft(
    parsedOrder({ customTextRequired: true }),
    parsedOrder({ customTextRequired: false }),
    parsedProduct({ customTextMaxLength: null }),
  );
  assert.ok(
    customText.some(
      (issue) => issue.message === CUSTOM_TEXT_REQUIRED_NEEDS_MAX_MESSAGE,
    ),
  );
});

test("successful save adopts the returned version from the parsed payload", () => {
  const returned = parseSellerSettingsResponse({
    settings: fullSettings({ version: 11 }),
  });
  assert.equal(returned.version, 11);
});

test("sectionHasChanges is false for identical snapshots", () => {
  const settings: SellerSettings = parseSellerSettingsResponse({
    settings: fullSettings(),
  });
  assert.equal(sectionHasChanges(settings.product, { ...settings.product }), false);
  assert.equal(
    sectionHasChanges(settings.product, {
      ...settings.product,
      material: "Porselen",
    }),
    true,
  );
});
