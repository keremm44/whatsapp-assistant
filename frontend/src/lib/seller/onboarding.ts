const ONBOARDING_CONTRACT_PREFIX = "onboarding_invalid_";

const contractError = (field: string): Error =>
  new Error(`${ONBOARDING_CONTRACT_PREFIX}${field}`);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown, field: string): string => {
  if (typeof value !== "string") throw contractError(field);
  return value;
};

const asNullableString = (value: unknown, field: string): string | null => {
  if (value === null || value === undefined) return null;
  return asString(value, field);
};

const asInteger = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw contractError(field);
  }
  return value;
};

const asBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== "boolean") throw contractError(field);
  return value;
};

export const ONBOARDING_STEP_STATUSES = [
  "locked",
  "available",
  "in_progress",
  "completed",
] as const;
export type OnboardingStepStatus = (typeof ONBOARDING_STEP_STATUSES)[number];

export const ONBOARDING_STEP_KEYS = [
  "business_info",
  "store_info",
  "product_info",
  "shipping_info",
  "return_policy",
  "rules_and_templates",
  "test_chat",
  "whatsapp_connection",
  "live_test",
  "activation",
] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export type OnboardingJsonSchema = Record<string, unknown>;

export type OnboardingSchemaStep = {
  stepOrder: number;
  stepKey: OnboardingStepKey;
  title: string;
  schema: OnboardingJsonSchema;
};

export type OnboardingSchema = {
  version: "onboarding_v1";
  totalSteps: 10;
  steps: OnboardingSchemaStep[];
};

export type OnboardingStatusStep = {
  id: number;
  stepOrder: number;
  stepKey: OnboardingStepKey;
  status: OnboardingStepStatus;
  stepData: Record<string, unknown>;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
};

export type OnboardingStatus = {
  sellerId: number;
  onboardingStatus: string;
  currentOnboardingStep: number;
  onboardingCompleted: boolean;
  systemStatus: string;
  aiEnabled: boolean;
  steps: OnboardingStatusStep[];
};

const parseStepKey = (value: unknown, field: string): OnboardingStepKey => {
  if (
    typeof value !== "string" ||
    !(ONBOARDING_STEP_KEYS as readonly string[]).includes(value)
  ) {
    throw contractError(field);
  }
  return value as OnboardingStepKey;
};

const parseStepStatus = (value: unknown): OnboardingStepStatus => {
  if (
    typeof value !== "string" ||
    !(ONBOARDING_STEP_STATUSES as readonly string[]).includes(value)
  ) {
    throw contractError("step_status");
  }
  return value as OnboardingStepStatus;
};

export const parseOnboardingSchema = (raw: unknown): OnboardingSchema => {
  if (!isObject(raw)) throw contractError("schema_response");
  if (raw.version !== "onboarding_v1") throw contractError("schema_version");
  if (raw.total_steps !== 10) throw contractError("schema_total_steps");
  if (!Array.isArray(raw.steps) || raw.steps.length !== 10) {
    throw contractError("schema_steps");
  }

  const steps = raw.steps.map((item, index): OnboardingSchemaStep => {
    if (!isObject(item)) throw contractError("schema_step");
    const stepOrder = asInteger(item.step_order, "schema_step_order");
    if (stepOrder !== index + 1) throw contractError("schema_step_sequence");
    const stepKey = parseStepKey(item.step_key, "schema_step_key");
    if (stepKey !== ONBOARDING_STEP_KEYS[index]) {
      throw contractError("schema_step_key_sequence");
    }
    if (!isObject(item.schema)) throw contractError("schema_step_schema");
    return {
      stepOrder,
      stepKey,
      title: asString(item.title, "schema_step_title"),
      schema: item.schema,
    };
  });

  return { version: "onboarding_v1", totalSteps: 10, steps };
};

export const parseOnboardingStatus = (raw: unknown): OnboardingStatus => {
  if (!isObject(raw) || raw.durum !== "başarılı") {
    throw contractError("status_response");
  }
  if (!Array.isArray(raw.steps) || raw.steps.length !== 10) {
    throw contractError("status_steps");
  }

  const steps = raw.steps.map((item, index): OnboardingStatusStep => {
    if (!isObject(item)) throw contractError("status_step");
    const stepOrder = asInteger(item.step_order, "status_step_order");
    if (stepOrder !== index + 1) throw contractError("status_step_sequence");
    const stepData = item.step_data;
    if (!isObject(stepData)) throw contractError("status_step_data");
    return {
      id: asInteger(item.id, "status_step_id"),
      stepOrder,
      stepKey: parseStepKey(item.step_key, "status_step_key"),
      status: parseStepStatus(item.status),
      stepData,
      startedAt: asNullableString(item.started_at, "status_started_at"),
      completedAt: asNullableString(item.completed_at, "status_completed_at"),
      updatedAt: asNullableString(item.updated_at, "status_updated_at"),
    };
  });

  return {
    sellerId: asInteger(raw.seller_id, "seller_id"),
    onboardingStatus: asString(raw.onboarding_status, "onboarding_status"),
    currentOnboardingStep: asInteger(
      raw.current_onboarding_step,
      "current_onboarding_step",
    ),
    onboardingCompleted: asBoolean(
      raw.onboarding_completed,
      "onboarding_completed",
    ),
    systemStatus: asString(raw.system_status, "system_status"),
    aiEnabled: asBoolean(raw.ai_enabled, "ai_enabled"),
    steps,
  };
};

export const ONBOARDING_CONTRACT_ERROR_PREFIX = ONBOARDING_CONTRACT_PREFIX;
