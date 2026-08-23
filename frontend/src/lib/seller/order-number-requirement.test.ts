import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOrderSectionPatch,
  parseSellerSettingsResponse,
  validateOrderDraft,
  type OrderSettings,
  type ProductSettings,
} from "./assistant-settings.ts";

const product: ProductSettings = {
  material: "Seramik",
  sizeMl: 330,
  printMethod: "Sublimasyon",
  customTextMaxLength: 40,
};

const current: OrderSettings = {
  minQuantity: 1,
  maxQuantity: null,
  orderNumberRequired: true,
  imageRequired: true,
  customTextRequired: false,
};

test("seller settings parser preserves order_number_required", () => {
  const parsed = parseSellerSettingsResponse({
    settings: {
      version: 7,
      updated_at: null,
      business: {},
      product: {},
      order: {
        min_quantity: 1,
        order_number_required: false,
        image_required: true,
        custom_text_required: false,
      },
      usage: {},
      shipping: {},
      return_policy: {},
    },
  });

  assert.equal(parsed.order.orderNumberRequired, false);
  assert.equal(parsed.order.imageRequired, true);
});

test("order patch writes only changed order_number_required", () => {
  const payload = buildOrderSectionPatch({
    expectedVersion: 7,
    current,
    draft: { ...current, orderNumberRequired: false },
  });

  assert.deepEqual(payload, {
    expected_version: 7,
    order: { order_number_required: false },
  });
});

test("order number requirement cannot become unspecified", () => {
  const draft = { ...current, orderNumberRequired: null };
  const issues = validateOrderDraft(draft, current, product);

  assert.equal(issues.some((issue) => issue.field === "order_number_required"), true);
});
