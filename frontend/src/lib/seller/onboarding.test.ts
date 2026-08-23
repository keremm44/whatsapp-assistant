import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ONBOARDING_STEP_KEYS,
  parseOnboardingSchema,
  parseOnboardingStatus,
} from "./onboarding.ts";

const schemaResponse = () => ({
  version: "onboarding_v1",
  total_steps: 10,
  steps: ONBOARDING_STEP_KEYS.map((stepKey, index) => ({
    step_order: index + 1,
    step_key: stepKey,
    title: `Adım ${index + 1}`,
    schema: {
      type: "object",
      properties: {},
    },
  })),
});

const statusResponse = () => ({
  durum: "başarılı",
  seller_id: 11,
  onboarding_status: "in_progress",
  current_onboarding_step: 2,
  onboarding_completed: false,
  system_status: "onboarding",
  ai_enabled: false,
  steps: ONBOARDING_STEP_KEYS.map((stepKey, index) => ({
    id: index + 101,
    seller_id: 11,
    step_order: index + 1,
    step_key: stepKey,
    status: index === 0 ? "completed" : index === 1 ? "in_progress" : "locked",
    step_data: index === 0 ? { name: "Faruk" } : {},
    started_at: index < 2 ? "2026-08-23T10:00:00+00:00" : null,
    completed_at: index === 0 ? "2026-08-23T10:10:00+00:00" : null,
    created_at: "2026-08-23T09:00:00+00:00",
    updated_at: "2026-08-23T10:10:00+00:00",
  })),
});

test("onboarding schema requires the canonical 10-step sequence", () => {
  const parsed = parseOnboardingSchema(schemaResponse());
  assert.equal(parsed.totalSteps, 10);
  assert.deepEqual(
    parsed.steps.map((step) => step.stepKey),
    ONBOARDING_STEP_KEYS,
  );

  const drifted = schemaResponse();
  drifted.steps[0]!.step_key = "store_info";
  assert.throws(() => parseOnboardingSchema(drifted), /onboarding_invalid_/);
});

test("onboarding status keeps backend step state and saved step data", () => {
  const parsed = parseOnboardingStatus(statusResponse());
  assert.equal(parsed.currentOnboardingStep, 2);
  assert.equal(parsed.steps[0]?.status, "completed");
  assert.deepEqual(parsed.steps[0]?.stepData, { name: "Faruk" });
  assert.equal(parsed.steps[1]?.status, "in_progress");
});

test("unknown onboarding step status fails closed", () => {
  const raw = statusResponse();
  raw.steps[1]!.status = "skipped";
  assert.throws(() => parseOnboardingStatus(raw), /onboarding_invalid_step_status/);
});
