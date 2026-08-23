import type { OnboardingJsonSchema } from "@/lib/seller/onboarding";

export type OnboardingFormFieldKind =
  | "string"
  | "integer"
  | "boolean"
  | "nullable_boolean";

export type OnboardingFormField = {
  key: string;
  title: string;
  description: string | null;
  kind: OnboardingFormFieldKind;
  required: boolean;
  constTrue: boolean;
  minimum: number | null;
  maximum: number | null;
  minLength: number | null;
  maxLength: number | null;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const detectKind = (schema: Record<string, unknown>): OnboardingFormFieldKind | null => {
  if (schema.type === "string") return "string";
  if (schema.type === "integer") return "integer";
  if (schema.type === "boolean") return "boolean";

  const anyOf = schema.anyOf;
  if (Array.isArray(anyOf)) {
    const types = anyOf
      .filter(isObject)
      .map((item) => item.type)
      .filter((value): value is string => typeof value === "string");
    if (types.includes("boolean") && types.includes("null")) {
      return "nullable_boolean";
    }
    if (types.includes("string") && types.includes("null")) return "string";
    if (types.includes("integer") && types.includes("null")) return "integer";
  }
  return null;
};

export const deriveOnboardingFormFields = (
  schema: OnboardingJsonSchema,
): OnboardingFormField[] => {
  const properties = schema.properties;
  if (!isObject(properties)) return [];
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((value): value is string => typeof value === "string")
      : [],
  );

  const fields: OnboardingFormField[] = [];
  for (const [key, rawProperty] of Object.entries(properties)) {
    if (!isObject(rawProperty)) continue;
    const kind = detectKind(rawProperty);
    // Complex arrays/objects are intentionally omitted when the backend has a
    // default. The backend remains authoritative and fills that default.
    if (kind === null) continue;
    fields.push({
      key,
      title:
        typeof rawProperty.title === "string" && rawProperty.title.length > 0
          ? rawProperty.title
          : key,
      description:
        typeof rawProperty.description === "string" ? rawProperty.description : null,
      kind,
      required: required.has(key),
      constTrue: rawProperty.const === true,
      minimum: numberOrNull(rawProperty.minimum),
      maximum: numberOrNull(rawProperty.maximum),
      minLength: numberOrNull(rawProperty.minLength),
      maxLength: numberOrNull(rawProperty.maxLength),
    });
  }
  return fields;
};

export type OnboardingDraft = Record<string, string | boolean | null>;

export const initialOnboardingDraft = (
  fields: OnboardingFormField[],
  stepData: Record<string, unknown>,
): OnboardingDraft => {
  const draft: OnboardingDraft = {};
  for (const field of fields) {
    const existing = stepData[field.key];
    if (typeof existing === "string" || typeof existing === "boolean" || existing === null) {
      draft[field.key] = existing;
    } else if (typeof existing === "number") {
      draft[field.key] = String(existing);
    } else if (field.constTrue) {
      draft[field.key] = false;
    } else if (field.kind === "nullable_boolean") {
      draft[field.key] = null;
    } else if (field.kind === "boolean") {
      draft[field.key] = false;
    } else {
      draft[field.key] = "";
    }
  }
  return draft;
};

export const buildOnboardingStepData = (
  fields: OnboardingFormField[],
  draft: OnboardingDraft,
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const value = draft[field.key];
    if (field.kind === "integer") {
      if (value === "" || value === null || value === undefined) {
        if (field.required) payload[field.key] = null;
        continue;
      }
      const number = Number(value);
      payload[field.key] = Number.isFinite(number) ? number : value;
      continue;
    }
    if (field.kind === "string") {
      if ((value === "" || value === null || value === undefined) && !field.required) {
        continue;
      }
      payload[field.key] = value === null || value === undefined ? "" : String(value);
      continue;
    }
    if (field.kind === "nullable_boolean") {
      payload[field.key] = value === undefined ? null : value;
      continue;
    }
    payload[field.key] = value === true;
  }
  return payload;
};
