export const SELLER_ENTITLEMENTS_CONTRACT_ERROR_PREFIX =
  "seller_entitlements_invalid_";

const PRODUCT_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export type SellerEntitlements = {
  products: string[];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseSellerEntitlements = (raw: unknown): SellerEntitlements => {
  if (!isPlainObject(raw) || !Array.isArray(raw.products)) {
    throw new Error(`${SELLER_ENTITLEMENTS_CONTRACT_ERROR_PREFIX}response`);
  }

  const products: string[] = [];
  const seen = new Set<string>();

  for (const product of raw.products) {
    if (typeof product !== "string" || !PRODUCT_KEY_PATTERN.test(product)) {
      throw new Error(
        `${SELLER_ENTITLEMENTS_CONTRACT_ERROR_PREFIX}product_key`,
      );
    }
    if (seen.has(product)) {
      throw new Error(`${SELLER_ENTITLEMENTS_CONTRACT_ERROR_PREFIX}duplicate`);
    }
    seen.add(product);
    products.push(product);
  }

  return { products };
};
