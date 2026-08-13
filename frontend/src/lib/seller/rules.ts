/**
 * Seller Rules — backend-derived contract layer.
 *
 * Source of truth:
 *   GET    /seller/rules
 *   GET    /seller/rules?active=true|false
 *   POST   /seller/rules
 *   PATCH  /seller/rules/{rule_id}
 *   DELETE /seller/rules/{rule_id}?expected_version=
 *
 * DELETE is deactivation, not historical deletion.
 * Category is not managed in Rules V1 — omit it on create/update.
 */

const RULES_CONTRACT_PREFIX = "rules_invalid_";

const contractError = (field: string): Error =>
  new Error(`${RULES_CONTRACT_PREFIX}${field}`);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readKey = (raw: Record<string, unknown>, key: string): unknown => raw[key];

const readRequiredPositiveInteger = (
  raw: Record<string, unknown>,
  key: string,
): number => {
  const value = readKey(raw, key);
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw contractError(key);
  }
  return value;
};

const readRequiredNonNegativeInteger = (
  raw: Record<string, unknown>,
  key: string,
): number => {
  const value = readKey(raw, key);
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw contractError(key);
  }
  return value;
};

const readRequiredString = (
  raw: Record<string, unknown>,
  key: string,
): string => {
  const value = readKey(raw, key);
  if (typeof value !== "string") throw contractError(key);
  return value;
};

const readRequiredBoolean = (
  raw: Record<string, unknown>,
  key: string,
): boolean => {
  const value = readKey(raw, key);
  if (typeof value !== "boolean") throw contractError(key);
  return value;
};

export const RULE_VIEWS = ["active", "inactive", "all"] as const;
export type RuleView = (typeof RULE_VIEWS)[number];

export type SellerRule = {
  id: number;
  triggerText: string;
  responseText: string;
  category: string;
  isActive: boolean;
  hitCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type RuleListPage = {
  rules: SellerRule[];
};

export type RuleMutationResult = {
  rule: SellerRule;
};

export type RuleDeactivateResult = {
  changed: boolean;
  rule: SellerRule;
};

const parseRule = (raw: unknown): SellerRule => {
  if (!isPlainObject(raw)) throw contractError("rule");
  return {
    id: readRequiredPositiveInteger(raw, "id"),
    triggerText: readRequiredString(raw, "trigger_text"),
    responseText: readRequiredString(raw, "response_text"),
    category: readRequiredString(raw, "category"),
    isActive: readRequiredBoolean(raw, "is_active"),
    hitCount: readRequiredNonNegativeInteger(raw, "hit_count"),
    version: readRequiredPositiveInteger(raw, "version"),
    createdAt: readRequiredString(raw, "created_at"),
    updatedAt: readRequiredString(raw, "updated_at"),
  };
};

export const parseRuleListResponse = (raw: unknown): RuleListPage => {
  if (!isPlainObject(raw)) throw contractError("response");
  const rulesRaw = readKey(raw, "rules");
  if (!Array.isArray(rulesRaw)) throw contractError("rules");
  return { rules: rulesRaw.map(parseRule) };
};

/**
 * Filtered-view entry point. When the request asked for active=true
 * or active=false, every returned rule must match. Inconsistent rows
 * fail the whole response — they are never silently dropped.
 */
export const parseFilteredRuleListResponse = (
  raw: unknown,
  expectedActive: boolean | undefined,
): RuleListPage => {
  const page = parseRuleListResponse(raw);
  if (expectedActive === undefined) return page;
  for (const rule of page.rules) {
    if (rule.isActive !== expectedActive) {
      throw contractError("is_active_filter");
    }
  }
  return page;
};

export const parseRuleMutationResponse = (raw: unknown): RuleMutationResult => {
  if (!isPlainObject(raw)) throw contractError("response");
  return { rule: parseRule(readKey(raw, "rule")) };
};

export const parseRuleDeactivateResponse = (
  raw: unknown,
): RuleDeactivateResult => {
  if (!isPlainObject(raw)) throw contractError("response");
  return {
    changed: readRequiredBoolean(raw, "changed"),
    rule: parseRule(readKey(raw, "rule")),
  };
};

export const RULE_TRIGGER_MIN_LENGTH = 2;
export const RULE_TRIGGER_MAX_LENGTH = 150;
export const RULE_RESPONSE_MIN_LENGTH = 2;
export const RULE_RESPONSE_MAX_LENGTH = 1500;

export type CreateRulePayload = {
  trigger_text: string;
  response_text: string;
};

export const buildCreateRulePayload = (input: {
  triggerText: string;
  responseText: string;
}): CreateRulePayload => ({
  trigger_text: input.triggerText.trim(),
  response_text: input.responseText.trim(),
});

export type UpdateRulePayload = {
  expected_version: number;
  trigger_text?: string;
  response_text?: string;
  is_active?: boolean;
};

export const buildEditRulePayload = (input: {
  version: number;
  triggerText: string;
  responseText: string;
}): UpdateRulePayload => ({
  expected_version: input.version,
  trigger_text: input.triggerText.trim(),
  response_text: input.responseText.trim(),
});

export const buildReactivateRulePayload = (version: number): UpdateRulePayload => ({
  expected_version: version,
  is_active: true,
});

export const RULES_CONTRACT_ERROR_PREFIX = RULES_CONTRACT_PREFIX;
