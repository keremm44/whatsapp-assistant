import assert from "node:assert/strict";
import test from "node:test";

import { parseSellerSettingsResponse } from "./assistant-settings.ts";

const settingsWithOrder = (order: Record<string, unknown>) => ({
  settings: {
    version: 1,
    order,
  },
});

test("missing legacy order_number_required is displayed as effectively enabled", () => {
  const parsed = parseSellerSettingsResponse(settingsWithOrder({}));
  assert.equal(parsed.order.orderNumberRequired, true);
});

test("legacy null order_number_required is displayed as effectively enabled", () => {
  const parsed = parseSellerSettingsResponse(
    settingsWithOrder({ order_number_required: null }),
  );
  assert.equal(parsed.order.orderNumberRequired, true);
});

test("explicit seller order-number choice remains authoritative", () => {
  const disabled = parseSellerSettingsResponse(
    settingsWithOrder({ order_number_required: false }),
  );
  const enabled = parseSellerSettingsResponse(
    settingsWithOrder({ order_number_required: true }),
  );

  assert.equal(disabled.order.orderNumberRequired, false);
  assert.equal(enabled.order.orderNumberRequired, true);
});
