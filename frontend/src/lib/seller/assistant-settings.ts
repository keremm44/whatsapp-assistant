/**
 * Seller settings — backend-derived contract layer.
 *
 * Source of truth (inspected, never assumed):
 *   GET   /seller/settings
 *   PATCH /seller/settings
 *
 * HTTP success envelope is `{ settings }` (the service `ok` flag is
 * unwrapped by the route). PATCH requires `expected_version` plus at
 * least one changed section. All sections share one global version.
 *
 * A value being nullable on GET does not mean it may be cleared on
 * PATCH. Explicit null is only allowed for the backend write allowlist
 * below. Missing/null booleans stay null — they are never coerced to
 * false.
 *
 * This module is dependency-free (types + parsers + payload builders)
 * so Node's built-in test runner can verify it.
 */

/* ------------------------------------------------------------------ */
/* Parse primitives                                                    */
/* ------------------------------------------------------------------ */

const SETTINGS_CONTRACT_PREFIX = "settings_invalid_";

const contractError = (field: string): Error =>
  new Error(`${SETTINGS_CONTRACT_PREFIX}${field}`);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readKey = (raw: Record<string, unknown>, key: string): unknown =>
  raw[key];

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

const readOptionalNullableString = (
  raw: Record<string, unknown>,
  key: string,
): string | null => {
  const value = readKey(raw, key);
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw contractError(key);
  return value;
};

const readOptionalNullableBoolean = (
  raw: Record<string, unknown>,
  key: string,
): boolean | null => {
  const value = readKey(raw, key);
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") throw contractError(key);
  return value;
};

const readOptionalNullableInteger = (
  raw: Record<string, unknown>,
  key: string,
): number | null => {
  const value = readKey(raw, key);
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw contractError(key);
  }
  return value;
};

const readSectionObject = (
  raw: Record<string, unknown>,
  key: string,
): Record<string, unknown> => {
  const value = readKey(raw, key);
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) throw contractError(key);
  return value;
};

/* ------------------------------------------------------------------ */
/* Typed contract                                                      */
/* ------------------------------------------------------------------ */

export type BusinessSettings = {
  name: string | null;
  phone: string | null;
  storeName: string | null;
  storeLink: string | null;
};

export type ProductSettings = {
  material: string | null;
  sizeMl: number | null;
  printMethod: string | null;
  customTextMaxLength: number | null;
};

export type OrderSettings = {
  minQuantity: number | null;
  maxQuantity: number | null;
  imageRequired: boolean | null;
  customTextRequired: boolean | null;
};

export type UsageSettings = {
  microwaveSafe: boolean | null;
  dishwasherSafe: boolean | null;
  handWashRecommended: boolean | null;
  foodSafe: boolean | null;
};

export type ShippingSettings = {
  processingDaysMin: number | null;
  processingDaysMax: number | null;
  sameDayAvailable: boolean | null;
  company: string | null;
  international: boolean | null;
};

export type ReturnPolicySettings = {
  acceptsReturns: boolean | null;
  returnPeriodDays: number | null;
  damageReplacement: boolean | null;
  wrongPrintReplacement: boolean | null;
};

export type SellerSettings = {
  version: number;
  updatedAt: string | null;
  business: BusinessSettings;
  product: ProductSettings;
  order: OrderSettings;
  usage: UsageSettings;
  shipping: ShippingSettings;
  returnPolicy: ReturnPolicySettings;
};

export type SettingsSectionKey =
  | "product"
  | "order"
  | "usage"
  | "shipping"
  | "return_policy";

/* ------------------------------------------------------------------ */
/* Field limits (backend Pydantic)                                     */
/* ------------------------------------------------------------------ */

export const PRODUCT_MATERIAL_MIN_LENGTH = 2;
export const PRODUCT_MATERIAL_MAX_LENGTH = 100;
export const PRODUCT_PRINT_METHOD_MIN_LENGTH = 2;
export const PRODUCT_PRINT_METHOD_MAX_LENGTH = 100;
export const PRODUCT_SIZE_ML_MIN = 50;
export const PRODUCT_SIZE_ML_MAX = 2000;
export const PRODUCT_CUSTOM_TEXT_MAX_LENGTH_MIN = 1;
export const PRODUCT_CUSTOM_TEXT_MAX_LENGTH_MAX = 500;

export const ORDER_QUANTITY_MIN = 1;
export const ORDER_QUANTITY_MAX = 100000;

export const SHIPPING_PROCESSING_DAYS_MIN = 0;
export const SHIPPING_PROCESSING_DAYS_MAX = 60;
export const SHIPPING_COMPANY_MIN_LENGTH = 2;
export const SHIPPING_COMPANY_MAX_LENGTH = 120;

export const RETURN_PERIOD_DAYS_MIN = 0;
export const RETURN_PERIOD_DAYS_MAX = 365;

/* ------------------------------------------------------------------ */
/* Null-clear allowlist                                                */
/* ------------------------------------------------------------------ */

/**
 * Fields the backend accepts as explicit null on PATCH.
 *
 * Inspected from `SellerSettingsUpdateRequest` validators:
 *   - ProductSettingsPatch forbids null for material/size_ml/print_method
 *     and allows custom_text_max_length
 *   - UsageSettingsPatch has no cannot-clear validator
 *   - ReturnPolicySettingsPatch forbids null for the three booleans and
 *     allows return_period_days
 *   - OrderSettingsPatch forbids null for min_quantity / image_required /
 *     custom_text_required and allows max_quantity
 *   - ShippingSettingsPatch forbids null for every shipping field
 */
export const NULL_CLEARABLE_FIELDS = {
  product: ["custom_text_max_length"],
  order: ["max_quantity"],
  usage: [
    "microwave_safe",
    "dishwasher_safe",
    "hand_wash_recommended",
    "food_safe",
  ],
  shipping: [],
  return_policy: ["return_period_days"],
} as const;

export type NullClearableSection = keyof typeof NULL_CLEARABLE_FIELDS;

export const isNullClearAllowed = (
  section: NullClearableSection,
  field: string,
): boolean =>
  (NULL_CLEARABLE_FIELDS[section] as readonly string[]).includes(field);

/* ------------------------------------------------------------------ */
/* Parsers                                                             */
/* ------------------------------------------------------------------ */

const parseBusiness = (raw: Record<string, unknown>): BusinessSettings => ({
  name: readOptionalNullableString(raw, "name"),
  phone: readOptionalNullableString(raw, "phone"),
  storeName: readOptionalNullableString(raw, "store_name"),
  storeLink: readOptionalNullableString(raw, "store_link"),
});

const parseProduct = (raw: Record<string, unknown>): ProductSettings => ({
  material: readOptionalNullableString(raw, "material"),
  sizeMl: readOptionalNullableInteger(raw, "size_ml"),
  printMethod: readOptionalNullableString(raw, "print_method"),
  customTextMaxLength: readOptionalNullableInteger(
    raw,
    "custom_text_max_length",
  ),
});

const parseOrder = (raw: Record<string, unknown>): OrderSettings => ({
  minQuantity: readOptionalNullableInteger(raw, "min_quantity"),
  maxQuantity: readOptionalNullableInteger(raw, "max_quantity"),
  imageRequired: readOptionalNullableBoolean(raw, "image_required"),
  customTextRequired: readOptionalNullableBoolean(raw, "custom_text_required"),
});

const parseUsage = (raw: Record<string, unknown>): UsageSettings => ({
  microwaveSafe: readOptionalNullableBoolean(raw, "microwave_safe"),
  dishwasherSafe: readOptionalNullableBoolean(raw, "dishwasher_safe"),
  handWashRecommended: readOptionalNullableBoolean(
    raw,
    "hand_wash_recommended",
  ),
  foodSafe: readOptionalNullableBoolean(raw, "food_safe"),
});

const parseShipping = (raw: Record<string, unknown>): ShippingSettings => ({
  processingDaysMin: readOptionalNullableInteger(raw, "processing_days_min"),
  processingDaysMax: readOptionalNullableInteger(raw, "processing_days_max"),
  sameDayAvailable: readOptionalNullableBoolean(raw, "same_day_available"),
  company: readOptionalNullableString(raw, "company"),
  international: readOptionalNullableBoolean(raw, "international"),
});

const parseReturnPolicy = (
  raw: Record<string, unknown>,
): ReturnPolicySettings => ({
  acceptsReturns: readOptionalNullableBoolean(raw, "accepts_returns"),
  returnPeriodDays: readOptionalNullableInteger(raw, "return_period_days"),
  damageReplacement: readOptionalNullableBoolean(raw, "damage_replacement"),
  wrongPrintReplacement: readOptionalNullableBoolean(
    raw,
    "wrong_print_replacement",
  ),
});

const parseSettingsObject = (raw: unknown): SellerSettings => {
  if (!isPlainObject(raw)) throw contractError("settings");
  return {
    version: readRequiredPositiveInteger(raw, "version"),
    updatedAt: readOptionalNullableString(raw, "updated_at"),
    business: parseBusiness(readSectionObject(raw, "business")),
    product: parseProduct(readSectionObject(raw, "product")),
    order: parseOrder(readSectionObject(raw, "order")),
    usage: parseUsage(readSectionObject(raw, "usage")),
    shipping: parseShipping(readSectionObject(raw, "shipping")),
    returnPolicy: parseReturnPolicy(readSectionObject(raw, "return_policy")),
  };
};

/**
 * Parse GET/PATCH `/seller/settings` success body.
 *
 * Accepts `{ settings }` (actual HTTP shape) and `{ ok: true, settings }`
 * (service shape). `ok: false` or a non-object settings payload fail
 * closed. Sparse/missing section fields become null.
 */
export const parseSellerSettingsResponse = (raw: unknown): SellerSettings => {
  if (!isPlainObject(raw)) throw contractError("response");
  if ("ok" in raw && raw.ok !== true) throw contractError("ok");
  return parseSettingsObject(readKey(raw, "settings"));
};

/* ------------------------------------------------------------------ */
/* PATCH payloads                                                      */
/* ------------------------------------------------------------------ */

export type ProductPatchFields = {
  material?: string;
  size_ml?: number;
  print_method?: string;
  custom_text_max_length?: number | null;
};

export type OrderPatchFields = {
  min_quantity?: number;
  max_quantity?: number | null;
  image_required?: boolean;
  custom_text_required?: boolean;
};

export type UsagePatchFields = {
  microwave_safe?: boolean | null;
  dishwasher_safe?: boolean | null;
  hand_wash_recommended?: boolean | null;
  food_safe?: boolean | null;
};

export type ShippingPatchFields = {
  processing_days_min?: number;
  processing_days_max?: number;
  same_day_available?: boolean;
  company?: string;
  international?: boolean;
};

export type ReturnPolicyPatchFields = {
  accepts_returns?: boolean;
  return_period_days?: number | null;
  damage_replacement?: boolean;
  wrong_print_replacement?: boolean;
};

export type SellerSettingsPatchPayload = {
  expected_version: number;
  product?: ProductPatchFields;
  order?: OrderPatchFields;
  usage?: UsagePatchFields;
  shipping?: ShippingPatchFields;
  return_policy?: ReturnPolicyPatchFields;
};

const assertPositiveVersion = (version: number): void => {
  if (typeof version !== "number" || !Number.isInteger(version) || version <= 0) {
    throw new Error("settings_invalid_expected_version");
  }
};

const rejectDisallowedNull = (
  section: NullClearableSection,
  field: string,
  value: unknown,
): void => {
  if (value === null && !isNullClearAllowed(section, field)) {
    throw new Error(`settings_null_forbidden_${section}_${field}`);
  }
};

const sameValue = (left: unknown, right: unknown): boolean =>
  Object.is(left, right);

const assignChanged = <T extends Record<string, unknown>>(
  target: T,
  key: keyof T,
  next: T[keyof T] | undefined,
  current: unknown,
): void => {
  if (next === undefined) return;
  if (sameValue(next, current)) return;
  target[key] = next;
};

export const buildProductSectionPatch = (input: {
  expectedVersion: number;
  current: ProductSettings;
  draft: ProductSettings;
}): SellerSettingsPatchPayload | null => {
  assertPositiveVersion(input.expectedVersion);
  const product: ProductPatchFields = {};
  if (!sameValue(input.draft.material, input.current.material)) {
    rejectDisallowedNull("product", "material", input.draft.material);
    if (input.draft.material !== null) product.material = input.draft.material;
  }
  if (!sameValue(input.draft.sizeMl, input.current.sizeMl)) {
    rejectDisallowedNull("product", "size_ml", input.draft.sizeMl);
    if (input.draft.sizeMl !== null) product.size_ml = input.draft.sizeMl;
  }
  if (!sameValue(input.draft.printMethod, input.current.printMethod)) {
    rejectDisallowedNull("product", "print_method", input.draft.printMethod);
    if (input.draft.printMethod !== null) {
      product.print_method = input.draft.printMethod;
    }
  }
  if (
    !sameValue(
      input.draft.customTextMaxLength,
      input.current.customTextMaxLength,
    )
  ) {
    product.custom_text_max_length = input.draft.customTextMaxLength;
  }
  if (Object.keys(product).length === 0) return null;
  return { expected_version: input.expectedVersion, product };
};

export const buildUsageSectionPatch = (input: {
  expectedVersion: number;
  current: UsageSettings;
  draft: UsageSettings;
}): SellerSettingsPatchPayload | null => {
  assertPositiveVersion(input.expectedVersion);
  const usage: UsagePatchFields = {};
  assignChanged(
    usage,
    "microwave_safe",
    input.draft.microwaveSafe,
    input.current.microwaveSafe,
  );
  assignChanged(
    usage,
    "dishwasher_safe",
    input.draft.dishwasherSafe,
    input.current.dishwasherSafe,
  );
  assignChanged(
    usage,
    "hand_wash_recommended",
    input.draft.handWashRecommended,
    input.current.handWashRecommended,
  );
  assignChanged(usage, "food_safe", input.draft.foodSafe, input.current.foodSafe);
  if (Object.keys(usage).length === 0) return null;
  return { expected_version: input.expectedVersion, usage };
};

export const buildShippingSectionPatch = (input: {
  expectedVersion: number;
  current: ShippingSettings;
  draft: ShippingSettings;
}): SellerSettingsPatchPayload | null => {
  assertPositiveVersion(input.expectedVersion);
  const shipping: ShippingPatchFields = {};
  if (
    !sameValue(input.draft.processingDaysMin, input.current.processingDaysMin)
  ) {
    rejectDisallowedNull(
      "shipping",
      "processing_days_min",
      input.draft.processingDaysMin,
    );
    if (input.draft.processingDaysMin !== null) {
      shipping.processing_days_min = input.draft.processingDaysMin;
    }
  }
  if (
    !sameValue(input.draft.processingDaysMax, input.current.processingDaysMax)
  ) {
    rejectDisallowedNull(
      "shipping",
      "processing_days_max",
      input.draft.processingDaysMax,
    );
    if (input.draft.processingDaysMax !== null) {
      shipping.processing_days_max = input.draft.processingDaysMax;
    }
  }
  if (
    !sameValue(input.draft.sameDayAvailable, input.current.sameDayAvailable)
  ) {
    rejectDisallowedNull(
      "shipping",
      "same_day_available",
      input.draft.sameDayAvailable,
    );
    if (input.draft.sameDayAvailable !== null) {
      shipping.same_day_available = input.draft.sameDayAvailable;
    }
  }
  if (!sameValue(input.draft.company, input.current.company)) {
    rejectDisallowedNull("shipping", "company", input.draft.company);
    if (input.draft.company !== null) shipping.company = input.draft.company;
  }
  if (!sameValue(input.draft.international, input.current.international)) {
    rejectDisallowedNull("shipping", "international", input.draft.international);
    if (input.draft.international !== null) {
      shipping.international = input.draft.international;
    }
  }
  if (Object.keys(shipping).length === 0) return null;
  return { expected_version: input.expectedVersion, shipping };
};

export const buildReturnPolicySectionPatch = (input: {
  expectedVersion: number;
  current: ReturnPolicySettings;
  draft: ReturnPolicySettings;
}): SellerSettingsPatchPayload | null => {
  assertPositiveVersion(input.expectedVersion);
  const returnPolicy: ReturnPolicyPatchFields = {};
  if (!sameValue(input.draft.acceptsReturns, input.current.acceptsReturns)) {
    rejectDisallowedNull(
      "return_policy",
      "accepts_returns",
      input.draft.acceptsReturns,
    );
    if (input.draft.acceptsReturns !== null) {
      returnPolicy.accepts_returns = input.draft.acceptsReturns;
    }
  }
  if (
    !sameValue(input.draft.returnPeriodDays, input.current.returnPeriodDays)
  ) {
    returnPolicy.return_period_days = input.draft.returnPeriodDays;
  }
  if (
    !sameValue(input.draft.damageReplacement, input.current.damageReplacement)
  ) {
    rejectDisallowedNull(
      "return_policy",
      "damage_replacement",
      input.draft.damageReplacement,
    );
    if (input.draft.damageReplacement !== null) {
      returnPolicy.damage_replacement = input.draft.damageReplacement;
    }
  }
  if (
    !sameValue(
      input.draft.wrongPrintReplacement,
      input.current.wrongPrintReplacement,
    )
  ) {
    rejectDisallowedNull(
      "return_policy",
      "wrong_print_replacement",
      input.draft.wrongPrintReplacement,
    );
    if (input.draft.wrongPrintReplacement !== null) {
      returnPolicy.wrong_print_replacement = input.draft.wrongPrintReplacement;
    }
  }
  if (Object.keys(returnPolicy).length === 0) return null;
  return { expected_version: input.expectedVersion, return_policy: returnPolicy };
};

export const buildOrderSectionPatch = (input: {
  expectedVersion: number;
  current: OrderSettings;
  draft: OrderSettings;
}): SellerSettingsPatchPayload | null => {
  assertPositiveVersion(input.expectedVersion);
  const order: OrderPatchFields = {};
  if (!sameValue(input.draft.minQuantity, input.current.minQuantity)) {
    rejectDisallowedNull("order", "min_quantity", input.draft.minQuantity);
    if (input.draft.minQuantity !== null) {
      order.min_quantity = input.draft.minQuantity;
    }
  }
  if (!sameValue(input.draft.maxQuantity, input.current.maxQuantity)) {
    order.max_quantity = input.draft.maxQuantity;
  }
  if (!sameValue(input.draft.imageRequired, input.current.imageRequired)) {
    rejectDisallowedNull("order", "image_required", input.draft.imageRequired);
    if (input.draft.imageRequired !== null) {
      order.image_required = input.draft.imageRequired;
    }
  }
  if (
    !sameValue(
      input.draft.customTextRequired,
      input.current.customTextRequired,
    )
  ) {
    rejectDisallowedNull(
      "order",
      "custom_text_required",
      input.draft.customTextRequired,
    );
    if (input.draft.customTextRequired !== null) {
      order.custom_text_required = input.draft.customTextRequired;
    }
  }
  if (Object.keys(order).length === 0) return null;
  return { expected_version: input.expectedVersion, order };
};

export const patchSectionKeys = (
  payload: SellerSettingsPatchPayload,
): SettingsSectionKey[] => {
  const keys: SettingsSectionKey[] = [];
  if (payload.product) keys.push("product");
  if (payload.order) keys.push("order");
  if (payload.usage) keys.push("usage");
  if (payload.shipping) keys.push("shipping");
  if (payload.return_policy) keys.push("return_policy");
  return keys;
};

/* ------------------------------------------------------------------ */
/* Effective-settings validation                                       */
/* ------------------------------------------------------------------ */

export type SettingsValidationIssue = {
  field: string;
  message: string;
};

export const CUSTOM_TEXT_MAX_REQUIRED_MESSAGE =
  "Özel yazı siparişte zorunlu olduğu için maksimum karakter sayısı belirtilmiş olmalıdır.";

export const CUSTOM_TEXT_REQUIRED_NEEDS_MAX_MESSAGE =
  "Özel yazı zorunlu olduğunda maksimum karakter sayısı da belirtilmelidir.";

export const SAME_DAY_MIN_ZERO_MESSAGE =
  "Aynı gün gönderim açıksa minimum hazırlık süresi 0 gün olmalıdır.";

export const SHIPPING_RANGE_MESSAGE =
  "Maksimum hazırlık süresi minimum hazırlık süresinden küçük olamaz.";

export const QUANTITY_RANGE_MESSAGE =
  "Maksimum sipariş adedi minimum sipariş adedinden küçük olamaz.";

export const RETURNS_TRUE_NEEDS_PERIOD_MESSAGE =
  "İade kabul ediliyorsa iade süresini de belirtin.";

export const RETURNS_FALSE_CLEARS_PERIOD_MESSAGE =
  "İade kabul edilmediği için iade süresi artık uygulanmaz.";

const inClosedRange = (value: number, min: number, max: number): boolean =>
  value >= min && value <= max;

const stringLengthOk = (value: string, min: number, max: number): boolean =>
  value.length >= min && value.length <= max;

export const validateProductDraft = (
  draft: ProductSettings,
  current: ProductSettings,
  order: OrderSettings,
): SettingsValidationIssue[] => {
  const issues: SettingsValidationIssue[] = [];

  if (draft.material !== current.material) {
    if (draft.material === null) {
      issues.push({
        field: "material",
        message: "Malzeme boş bırakılamaz.",
      });
    } else if (
      !stringLengthOk(
        draft.material,
        PRODUCT_MATERIAL_MIN_LENGTH,
        PRODUCT_MATERIAL_MAX_LENGTH,
      )
    ) {
      issues.push({
        field: "material",
        message: "Malzeme 2 ile 100 karakter arasında olmalıdır.",
      });
    }
  }

  if (draft.sizeMl !== current.sizeMl) {
    if (draft.sizeMl === null) {
      issues.push({ field: "size_ml", message: "Hacim boş bırakılamaz." });
    } else if (!inClosedRange(draft.sizeMl, PRODUCT_SIZE_ML_MIN, PRODUCT_SIZE_ML_MAX)) {
      issues.push({
        field: "size_ml",
        message: "Hacim 50 ile 2000 ml arasında olmalıdır.",
      });
    }
  }

  if (draft.printMethod !== current.printMethod) {
    if (draft.printMethod === null) {
      issues.push({
        field: "print_method",
        message: "Baskı yöntemi boş bırakılamaz.",
      });
    } else if (
      !stringLengthOk(
        draft.printMethod,
        PRODUCT_PRINT_METHOD_MIN_LENGTH,
        PRODUCT_PRINT_METHOD_MAX_LENGTH,
      )
    ) {
      issues.push({
        field: "print_method",
        message: "Baskı yöntemi 2 ile 100 karakter arasında olmalıdır.",
      });
    }
  }

  if (draft.customTextMaxLength !== current.customTextMaxLength) {
    if (draft.customTextMaxLength === null) {
      if (order.customTextRequired === true) {
        issues.push({
          field: "custom_text_max_length",
          message: CUSTOM_TEXT_MAX_REQUIRED_MESSAGE,
        });
      }
    } else if (
      !inClosedRange(
        draft.customTextMaxLength,
        PRODUCT_CUSTOM_TEXT_MAX_LENGTH_MIN,
        PRODUCT_CUSTOM_TEXT_MAX_LENGTH_MAX,
      )
    ) {
      issues.push({
        field: "custom_text_max_length",
        message: "Maksimum karakter sayısı 1 ile 500 arasında olmalıdır.",
      });
    }
  } else if (
    order.customTextRequired === true &&
    draft.customTextMaxLength === null
  ) {
    // No local change, but saving other product fields would still
    // leave the effective settings invalid if the seller later
    // enables custom text elsewhere. Only block when this field is
    // the one being cleared (handled above).
  }

  return issues;
};

export const validateShippingDraft = (
  draft: ShippingSettings,
  current: ShippingSettings,
): SettingsValidationIssue[] => {
  const issues: SettingsValidationIssue[] = [];

  if (draft.processingDaysMin !== current.processingDaysMin) {
    if (draft.processingDaysMin === null) {
      issues.push({
        field: "processing_days_min",
        message: "Minimum hazırlık süresi boş bırakılamaz.",
      });
    } else if (
      !inClosedRange(
        draft.processingDaysMin,
        SHIPPING_PROCESSING_DAYS_MIN,
        SHIPPING_PROCESSING_DAYS_MAX,
      )
    ) {
      issues.push({
        field: "processing_days_min",
        message: "Minimum hazırlık süresi 0 ile 60 gün arasında olmalıdır.",
      });
    }
  }

  if (draft.processingDaysMax !== current.processingDaysMax) {
    if (draft.processingDaysMax === null) {
      issues.push({
        field: "processing_days_max",
        message: "Maksimum hazırlık süresi boş bırakılamaz.",
      });
    } else if (
      !inClosedRange(
        draft.processingDaysMax,
        SHIPPING_PROCESSING_DAYS_MIN,
        SHIPPING_PROCESSING_DAYS_MAX,
      )
    ) {
      issues.push({
        field: "processing_days_max",
        message: "Maksimum hazırlık süresi 0 ile 60 gün arasında olmalıdır.",
      });
    }
  }

  if (draft.company !== current.company) {
    if (draft.company === null) {
      issues.push({
        field: "company",
        message: "Kargo firması boş bırakılamaz.",
      });
    } else if (
      !stringLengthOk(
        draft.company,
        SHIPPING_COMPANY_MIN_LENGTH,
        SHIPPING_COMPANY_MAX_LENGTH,
      )
    ) {
      issues.push({
        field: "company",
        message: "Kargo firması 2 ile 120 karakter arasında olmalıdır.",
      });
    }
  }

  if (draft.sameDayAvailable !== current.sameDayAvailable) {
    if (draft.sameDayAvailable === null) {
      issues.push({
        field: "same_day_available",
        message: "Aynı gün gönderim seçilmelidir.",
      });
    }
  }

  if (draft.international !== current.international) {
    if (draft.international === null) {
      issues.push({
        field: "international",
        message: "Yurt dışı gönderim seçilmelidir.",
      });
    }
  }

  const effectiveMin =
    draft.processingDaysMin !== null
      ? draft.processingDaysMin
      : current.processingDaysMin;
  const effectiveMax =
    draft.processingDaysMax !== null
      ? draft.processingDaysMax
      : current.processingDaysMax;
  if (
    typeof effectiveMin === "number" &&
    typeof effectiveMax === "number" &&
    effectiveMax < effectiveMin
  ) {
    issues.push({ field: "processing_days_max", message: SHIPPING_RANGE_MESSAGE });
  }

  const effectiveSameDay =
    draft.sameDayAvailable !== null
      ? draft.sameDayAvailable
      : current.sameDayAvailable;
  if (
    effectiveSameDay === true &&
    typeof effectiveMin === "number" &&
    effectiveMin > 0
  ) {
    issues.push({
      field: "same_day_available",
      message: SAME_DAY_MIN_ZERO_MESSAGE,
    });
  }

  return issues;
};

export const validateReturnPolicyDraft = (
  draft: ReturnPolicySettings,
  current: ReturnPolicySettings,
): SettingsValidationIssue[] => {
  const issues: SettingsValidationIssue[] = [];

  if (draft.acceptsReturns !== current.acceptsReturns) {
    if (draft.acceptsReturns === null) {
      issues.push({
        field: "accepts_returns",
        message: "İade kabulü seçilmelidir.",
      });
    }
  }

  if (draft.damageReplacement !== current.damageReplacement) {
    if (draft.damageReplacement === null) {
      issues.push({
        field: "damage_replacement",
        message: "Hasarlı ürün değişimi seçilmelidir.",
      });
    }
  }

  if (draft.wrongPrintReplacement !== current.wrongPrintReplacement) {
    if (draft.wrongPrintReplacement === null) {
      issues.push({
        field: "wrong_print_replacement",
        message: "Yanlış baskı değişimi seçilmelidir.",
      });
    }
  }

  if (draft.returnPeriodDays !== current.returnPeriodDays) {
    if (
      draft.returnPeriodDays !== null &&
      !inClosedRange(
        draft.returnPeriodDays,
        RETURN_PERIOD_DAYS_MIN,
        RETURN_PERIOD_DAYS_MAX,
      )
    ) {
      issues.push({
        field: "return_period_days",
        message: "İade süresi 0 ile 365 gün arasında olmalıdır.",
      });
    }
  }

  const effectiveAccepts =
    draft.acceptsReturns !== null
      ? draft.acceptsReturns
      : current.acceptsReturns;
  const effectivePeriod = draft.returnPeriodDays;

  if (effectiveAccepts === true) {
    if (!Number.isInteger(effectivePeriod) || (effectivePeriod ?? 0) < 1) {
      issues.push({
        field: "return_period_days",
        message: RETURNS_TRUE_NEEDS_PERIOD_MESSAGE,
      });
    }
  }

  return issues;
};

/**
 * When returns are turned off, a positive period must be cleared in
 * the same atomic PATCH. The UI should already have set the draft
 * period to null; this helper makes that contract explicit.
 */
export const applyReturnsDisabledClear = (
  draft: ReturnPolicySettings,
): ReturnPolicySettings => {
  if (draft.acceptsReturns !== false) return draft;
  if (draft.returnPeriodDays === null || draft.returnPeriodDays === 0) {
    return draft;
  }
  return { ...draft, returnPeriodDays: null };
};

export const validateOrderDraft = (
  draft: OrderSettings,
  current: OrderSettings,
  product: ProductSettings,
): SettingsValidationIssue[] => {
  const issues: SettingsValidationIssue[] = [];

  if (draft.minQuantity !== current.minQuantity) {
    if (draft.minQuantity === null) {
      issues.push({
        field: "min_quantity",
        message: "Minimum sipariş adedi boş bırakılamaz.",
      });
    } else if (
      !inClosedRange(draft.minQuantity, ORDER_QUANTITY_MIN, ORDER_QUANTITY_MAX)
    ) {
      issues.push({
        field: "min_quantity",
        message: "Minimum sipariş adedi 1 ile 100000 arasında olmalıdır.",
      });
    }
  }

  if (draft.maxQuantity !== current.maxQuantity) {
    if (
      draft.maxQuantity !== null &&
      !inClosedRange(draft.maxQuantity, ORDER_QUANTITY_MIN, ORDER_QUANTITY_MAX)
    ) {
      issues.push({
        field: "max_quantity",
        message: "Maksimum sipariş adedi 1 ile 100000 arasında olmalıdır.",
      });
    }
  }

  const effectiveMin =
    draft.minQuantity !== null ? draft.minQuantity : current.minQuantity;
  const effectiveMax = draft.maxQuantity;
  if (
    typeof effectiveMin === "number" &&
    typeof effectiveMax === "number" &&
    effectiveMax < effectiveMin
  ) {
    issues.push({ field: "max_quantity", message: QUANTITY_RANGE_MESSAGE });
  }

  if (draft.imageRequired !== current.imageRequired) {
    if (draft.imageRequired === null) {
      issues.push({
        field: "image_required",
        message: "Görsel isteği seçilmelidir.",
      });
    }
  }

  if (draft.customTextRequired !== current.customTextRequired) {
    if (draft.customTextRequired === null) {
      issues.push({
        field: "custom_text_required",
        message: "Özel yazı isteği seçilmelidir.",
      });
    }
  }

  const effectiveCustomRequired =
    draft.customTextRequired !== null
      ? draft.customTextRequired
      : current.customTextRequired;
  if (
    effectiveCustomRequired === true &&
    product.customTextMaxLength === null
  ) {
    issues.push({
      field: "custom_text_required",
      message: CUSTOM_TEXT_REQUIRED_NEEDS_MAX_MESSAGE,
    });
  }

  return issues;
};

export const sectionHasChanges = <T extends Record<string, unknown>>(
  current: T,
  draft: T,
): boolean => {
  for (const key of Object.keys(current) as (keyof T)[]) {
    if (!sameValue(current[key], draft[key])) return true;
  }
  return false;
};

export const SETTINGS_CONTRACT_ERROR_PREFIX = SETTINGS_CONTRACT_PREFIX;
