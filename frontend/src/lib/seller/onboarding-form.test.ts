import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildOnboardingStepData,
  deriveOnboardingFormFields,
  initialOnboardingDraft,
} from "./onboarding-form.ts";

test("derives primitive controls and ignores defaulted complex arrays", () => {
  const fields = deriveOnboardingFormFields({
    type: "object",
    properties: {
      store_name: { type: "string", minLength: 2, maxLength: 160 },
      min_quantity: { type: "integer", minimum: 1, maximum: 100000 },
      image_required: { type: "boolean", const: true },
      microwave_safe: {
        anyOf: [{ type: "boolean" }, { type: "null" }],
      },
      rules: { type: "array", default: [], items: { type: "object" } },
    },
    required: ["store_name", "min_quantity", "image_required", "microwave_safe"],
  });

  assert.deepEqual(
    fields.map((field) => [field.key, field.kind, field.required, field.constTrue]),
    [
      ["store_name", "string", true, false],
      ["min_quantity", "integer", true, false],
      ["image_required", "boolean", true, true],
      ["microwave_safe", "nullable_boolean", true, false],
    ],
  );
});

test("saved backend values initialize the draft without inventing defaults", () => {
  const fields = deriveOnboardingFormFields({
    type: "object",
    properties: {
      min_quantity: { type: "integer" },
      international: { type: "boolean" },
      food_safe: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    },
    required: ["min_quantity", "international", "food_safe"],
  });

  const draft = initialOnboardingDraft(fields, {
    min_quantity: 4,
    international: true,
    food_safe: null,
  });

  assert.deepEqual(draft, {
    min_quantity: "4",
    international: true,
    food_safe: null,
  });
});

test("builds backend-shaped numbers and nullable booleans", () => {
  const fields = deriveOnboardingFormFields({
    type: "object",
    properties: {
      processing_days_min: { type: "integer", minimum: 0 },
      same_day_available: { type: "boolean" },
      dishwasher_safe: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    },
    required: ["processing_days_min", "same_day_available", "dishwasher_safe"],
  });

  assert.deepEqual(
    buildOnboardingStepData(fields, {
      processing_days_min: "2",
      same_day_available: false,
      dishwasher_safe: null,
    }),
    {
      processing_days_min: 2,
      same_day_available: false,
      dishwasher_safe: null,
    },
  );
});
