/**
 * Seller Products + product-specific personalization fields —
 * backend-derived contract layer.
 *
 * Source of truth (inspected, never assumed):
 *   GET/POST /seller/products
 *   PATCH    /seller/products/{product_id}
 *   GET/POST /seller/order-field-definitions
 *   PATCH    /seller/order-field-definitions/{field_id}
 *
 * A Product in V1 is only: id, name, is_active, version, timestamps.
 * There is no hard-delete. Field PATCH cannot change product_id,
 * field_key, field_type, options, or validation_config.
 *
 * This module is dependency-free (types + parsers + payload builders)
 * so Node's built-in test runner can verify it.
 */

/* ------------------------------------------------------------------ */
/* Parse primitives                                                    */
/* ------------------------------------------------------------------ */

const PRODUCTS_CONTRACT_PREFIX = "products_invalid_";

const contractError = (field: string): Error =>
  new Error(`${PRODUCTS_CONTRACT_PREFIX}${field}`);

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
  if (typeof value !== "string") {
    throw contractError(key);
  }
  return value;
};

const readRequiredBoolean = (
  raw: Record<string, unknown>,
  key: string,
): boolean => {
  const value = readKey(raw, key);
  if (typeof value !== "boolean") {
    throw contractError(key);
  }
  return value;
};

const readNullablePositiveInteger = (
  raw: Record<string, unknown>,
  key: string,
): number | null => {
  const value = readKey(raw, key);
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw contractError(key);
  }
  return value;
};

const readLiteral = <T extends string>(
  raw: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T => {
  const value = readRequiredString(raw, key);
  if (!allowed.includes(value as T)) {
    throw contractError(key);
  }
  return value as T;
};

/* ------------------------------------------------------------------ */
/* Allowlists (backend-owned)                                          */
/* ------------------------------------------------------------------ */

/** `ORDER_FIELD_TYPES` in backend/database.py. */
export const PRODUCT_FIELD_TYPES = [
  "short_text",
  "long_text",
  "number",
  "single_choice",
  "multi_choice",
  "boolean",
  "image",
] as const;
export type ProductFieldType = (typeof PRODUCT_FIELD_TYPES)[number];

export const isChoiceFieldType = (
  fieldType: ProductFieldType,
): fieldType is "single_choice" | "multi_choice" =>
  fieldType === "single_choice" || fieldType === "multi_choice";

/* ------------------------------------------------------------------ */
/* Typed contract                                                      */
/* ------------------------------------------------------------------ */

export type Product = {
  id: number;
  name: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductListPage = {
  products: Product[];
  total: number;
};

export type ProductMutationResult = {
  changed: boolean;
  product: Product;
};

export type FieldOption = {
  value: string;
  label: string;
};

export type ProductFieldDefinition = {
  id: number;
  productId: number | null;
  /** Technical identifier — parsed, never rendered. */
  fieldKey: string;
  label: string;
  fieldType: ProductFieldType;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  options: FieldOption[];
  validationConfig: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductFieldListPage = {
  pageCount: number;
  definitions: ProductFieldDefinition[];
};

/* ------------------------------------------------------------------ */
/* Product parsers                                                     */
/* ------------------------------------------------------------------ */

const parseProduct = (raw: unknown): Product => {
  if (!isPlainObject(raw)) throw contractError("product");
  return {
    id: readRequiredPositiveInteger(raw, "id"),
    name: readRequiredString(raw, "name"),
    isActive: readRequiredBoolean(raw, "is_active"),
    version: readRequiredPositiveInteger(raw, "version"),
    createdAt: readRequiredString(raw, "created_at"),
    updatedAt: readRequiredString(raw, "updated_at"),
  };
};

const parseProductListPage = (raw: unknown): ProductListPage => {
  if (!isPlainObject(raw)) throw contractError("response");
  const productsRaw = readKey(raw, "products");
  if (!Array.isArray(productsRaw)) throw contractError("products");
  return {
    products: productsRaw.map(parseProduct),
    total: readRequiredNonNegativeInteger(raw, "total"),
  };
};

const parseProductMutationResult = (raw: unknown): ProductMutationResult => {
  if (!isPlainObject(raw)) throw contractError("response");
  return {
    changed: readRequiredBoolean(raw, "changed"),
    product: parseProduct(readKey(raw, "product")),
  };
};

/* ------------------------------------------------------------------ */
/* Field parsers                                                       */
/* ------------------------------------------------------------------ */

const parseFieldOption = (raw: unknown): FieldOption => {
  if (!isPlainObject(raw)) throw contractError("option");
  const value = readRequiredString(raw, "value");
  const label = readRequiredString(raw, "label");
  if (!value.trim()) throw contractError("option_value");
  return { value, label };
};

const parseValidationConfig = (raw: unknown): Record<string, unknown> => {
  if (raw === null || raw === undefined) return {};
  if (!isPlainObject(raw)) throw contractError("validation_config");
  return raw;
};

const parseFieldDefinition = (raw: unknown): ProductFieldDefinition => {
  if (!isPlainObject(raw)) throw contractError("definition");
  const optionsRaw = readKey(raw, "options");
  let options: FieldOption[] = [];
  if (optionsRaw !== null && optionsRaw !== undefined) {
    if (!Array.isArray(optionsRaw)) throw contractError("options");
    options = optionsRaw.map(parseFieldOption);
  }
  return {
    id: readRequiredPositiveInteger(raw, "id"),
    productId: readNullablePositiveInteger(raw, "product_id"),
    fieldKey: readRequiredString(raw, "field_key"),
    label: readRequiredString(raw, "label"),
    fieldType: readLiteral(raw, "field_type", PRODUCT_FIELD_TYPES),
    isRequired: readRequiredBoolean(raw, "is_required"),
    isActive: readRequiredBoolean(raw, "is_active"),
    sortOrder: readRequiredNonNegativeInteger(raw, "sort_order"),
    options,
    validationConfig: parseValidationConfig(readKey(raw, "validation_config")),
    version: readRequiredPositiveInteger(raw, "version"),
    createdAt: readRequiredString(raw, "created_at"),
    updatedAt: readRequiredString(raw, "updated_at"),
  };
};

const parseFieldListPage = (raw: unknown): ProductFieldListPage => {
  if (!isPlainObject(raw)) throw contractError("response");
  const definitionsRaw = readKey(raw, "definitions");
  if (!Array.isArray(definitionsRaw)) throw contractError("definitions");
  return {
    pageCount: readRequiredNonNegativeInteger(raw, "toplam"),
    definitions: definitionsRaw.map(parseFieldDefinition),
  };
};

const parseFieldDefinitionResponse = (
  raw: unknown,
): ProductFieldDefinition => {
  if (!isPlainObject(raw)) throw contractError("response");
  return parseFieldDefinition(readKey(raw, "definition"));
};

/* ------------------------------------------------------------------ */
/* Field-key + choice-option builders                                  */
/* ------------------------------------------------------------------ */

const TURKISH_TO_ASCII: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  I: "i",
  İ: "i",
  i: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
};

const transliterateTurkish = (value: string): string => {
  let result = "";
  for (const character of value) {
    result += TURKISH_TO_ASCII[character] ?? character;
  }
  return result;
};

/**
 * Generate a backend-safe field_key from product id + seller label.
 * Shape: p{productId}_{normalized_label}  (max 64, starts with a letter).
 */
export const generateFieldKey = (productId: number, label: string): string => {
  const prefix = `p${productId}_`;
  let body = transliterateTurkish(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (!body) body = "alan";
  const maxBody = Math.max(1, 64 - prefix.length);
  body = body.slice(0, maxBody).replace(/_+$/g, "");
  if (!body) body = "alan".slice(0, maxBody);
  return `${prefix}${body}`;
};

/** Seller-facing labels only; internal values are order-based. */
export const buildChoiceOptions = (
  labels: readonly string[],
): FieldOption[] => {
  const cleaned = labels
    .map((label) => (typeof label === "string" ? label.trim() : ""))
    .filter((label) => label.length > 0);
  return cleaned.map((label, index) => ({
    value: `opt_${index + 1}`,
    label,
  }));
};

export const choiceLabelsAreValid = (labels: readonly string[]): boolean => {
  const cleaned = labels
    .map((label) => (typeof label === "string" ? label.trim() : ""))
    .filter((label) => label.length > 0);
  return cleaned.length >= 2 && new Set(cleaned).size === cleaned.length;
};

/* ------------------------------------------------------------------ */
/* Mutation payload builders                                           */
/* ------------------------------------------------------------------ */

export const PRODUCT_NAME_MIN_LENGTH = 2;
export const PRODUCT_NAME_MAX_LENGTH = 200;
export const FIELD_LABEL_MIN_LENGTH = 1;
export const FIELD_LABEL_MAX_LENGTH = 120;

export type CreateProductPayload = { name: string };

export const buildCreateProductPayload = (name: string): CreateProductPayload => ({
  name: name.trim(),
});

export type UpdateProductPayload = {
  expected_version: number;
  name?: string;
  is_active?: boolean;
};

export const buildRenameProductPayload = (input: {
  version: number;
  name: string;
}): UpdateProductPayload => ({
  expected_version: input.version,
  name: input.name.trim(),
});

export const buildProductStatusPayload = (input: {
  version: number;
  isActive: boolean;
}): UpdateProductPayload => ({
  expected_version: input.version,
  is_active: input.isActive,
});

export type CreateFieldPayload = {
  product_id: number;
  field_key: string;
  label: string;
  field_type: ProductFieldType;
  is_required: boolean;
  sort_order: number;
  options?: FieldOption[];
};

export const buildCreateFieldPayload = (input: {
  productId: number;
  label: string;
  fieldType: ProductFieldType;
  isRequired: boolean;
  sortOrder: number;
  optionLabels?: readonly string[];
}): CreateFieldPayload => {
  const label = input.label.trim();
  const payload: CreateFieldPayload = {
    product_id: input.productId,
    field_key: generateFieldKey(input.productId, label),
    label,
    field_type: input.fieldType,
    is_required: input.isRequired,
    sort_order: input.sortOrder,
  };
  if (isChoiceFieldType(input.fieldType)) {
    payload.options = buildChoiceOptions(input.optionLabels ?? []);
  }
  return payload;
};

export type UpdateFieldPayload = {
  expected_version: number;
  label?: string;
  is_required?: boolean;
  is_active?: boolean;
};

export const buildUpdateFieldPayload = (input: {
  version: number;
  label?: string;
  isRequired?: boolean;
  isActive?: boolean;
}): UpdateFieldPayload => {
  const payload: UpdateFieldPayload = {
    expected_version: input.version,
  };
  if (typeof input.label === "string") {
    payload.label = input.label.trim();
  }
  if (typeof input.isRequired === "boolean") {
    payload.is_required = input.isRequired;
  }
  if (typeof input.isActive === "boolean") {
    payload.is_active = input.isActive;
  }
  return payload;
};

/** Keys that must never appear on a field PATCH. */
export const FIELD_IMMUTABLE_PATCH_KEYS = [
  "product_id",
  "field_key",
  "field_type",
  "options",
  "validation_config",
  "seller_id",
] as const;

export const fieldPatchHasOnlyMutableKeys = (
  payload: Record<string, unknown>,
): boolean =>
  FIELD_IMMUTABLE_PATCH_KEYS.every((key) => !(key in payload));

/* ------------------------------------------------------------------ */
/* Parse entry points                                                  */
/* ------------------------------------------------------------------ */

export const parseProductListResponse = (raw: unknown): ProductListPage =>
  parseProductListPage(raw);

export const parseProductMutationResponse = (
  raw: unknown,
): ProductMutationResult => parseProductMutationResult(raw);

export const parseProductFieldListResponse = (
  raw: unknown,
): ProductFieldListPage => parseFieldListPage(raw);

export const parseProductFieldDefinitionResponse = (
  raw: unknown,
): ProductFieldDefinition => parseFieldDefinitionResponse(raw);

export const PRODUCTS_CONTRACT_ERROR_PREFIX = PRODUCTS_CONTRACT_PREFIX;
