/**
 * Seller Products — authenticated fetchers.
 *
 * Environment-neutral: every function takes an already-resolved access
 * token. Contract parsing lives in `products.ts`.
 */

import { apiFetchWithAccessToken } from "@/lib/api/authenticated";
import {
  parseProductFieldDefinitionResponse,
  parseProductSpecificFieldListResponse,
  parseProductListResponse,
  parseProductMutationResponse,
  type CreateFieldPayload,
  type CreateProductPayload,
  type ProductFieldDefinition,
  type ProductFieldListPage,
  type ProductListPage,
  type ProductMutationResult,
  type UpdateFieldPayload,
  type UpdateProductPayload,
} from "@/lib/seller/products";

export type FetchProductsOptions = {
  includeInactive?: boolean;
  signal?: AbortSignal;
  cache?: RequestCache;
};

/** Fetch and parse `GET /seller/products`. */
export const fetchProductList = async (
  accessToken: string,
  options?: FetchProductsOptions,
): Promise<ProductListPage> => {
  const query = new URLSearchParams();
  if (options?.includeInactive === true) {
    query.set("include_inactive", "true");
  }
  const qs = query.toString();
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/products${qs ? `?${qs}` : ""}`,
    accessToken,
    { signal: options?.signal, cache: options?.cache ?? "no-store" },
  );
  return parseProductListResponse(raw);
};

export const createProduct = async (
  accessToken: string,
  payload: CreateProductPayload,
  options?: { signal?: AbortSignal },
): Promise<ProductMutationResult> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    "/seller/products",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(payload),
      signal: options?.signal,
      cache: "no-store",
    },
  );
  return parseProductMutationResponse(raw);
};

export const updateProduct = async (
  accessToken: string,
  productId: number,
  payload: UpdateProductPayload,
  options?: { signal?: AbortSignal },
): Promise<ProductMutationResult> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/products/${productId}`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
      signal: options?.signal,
      cache: "no-store",
    },
  );
  return parseProductMutationResponse(raw);
};

export type FetchFieldDefinitionsOptions = {
  productId: number;
  includeInactive?: boolean;
  signal?: AbortSignal;
  cache?: RequestCache;
};

/** Fetch product-specific field definitions only. */
export const fetchProductFieldList = async (
  accessToken: string,
  options: FetchFieldDefinitionsOptions,
): Promise<ProductFieldListPage> => {
  const query = new URLSearchParams();
  query.set("product_id", String(options.productId));
  if (options.includeInactive === true) {
    query.set("include_inactive", "true");
  }
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/order-field-definitions?${query.toString()}`,
    accessToken,
    { signal: options.signal, cache: options.cache ?? "no-store" },
  );
  return parseProductSpecificFieldListResponse(raw, options.productId);
};

export const createProductField = async (
  accessToken: string,
  payload: CreateFieldPayload,
  options?: { signal?: AbortSignal },
): Promise<ProductFieldDefinition> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    "/seller/order-field-definitions",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(payload),
      signal: options?.signal,
      cache: "no-store",
    },
  );
  return parseProductFieldDefinitionResponse(raw);
};

export const updateProductField = async (
  accessToken: string,
  fieldId: number,
  payload: UpdateFieldPayload,
  options?: { signal?: AbortSignal },
): Promise<ProductFieldDefinition> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/order-field-definitions/${fieldId}`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
      signal: options?.signal,
      cache: "no-store",
    },
  );
  return parseProductFieldDefinitionResponse(raw);
};
