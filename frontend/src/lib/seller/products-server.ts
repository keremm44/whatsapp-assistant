/**
 * Server-side resolvers for Seller Products.
 *
 * Same state machine as unanswered/orders:
 *   ready / unavailable / auth_rejected
 *
 * Never signs the seller out. An unavailable products response is
 * never treated as an empty catalog.
 */

import { ApiError } from "@/lib/api/client";
import {
  fetchProductFieldList,
  fetchProductList,
} from "@/lib/seller/products-api";
import {
  PRODUCTS_CONTRACT_ERROR_PREFIX,
  type ProductFieldListPage,
  type ProductListPage,
} from "@/lib/seller/products";
import { resolveSession } from "@/lib/supabase/session";

export type ProductsListBootstrap =
  | { state: "ready"; page: ProductListPage }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

export type ProductFieldsBootstrap =
  | { state: "ready"; page: ProductFieldListPage }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

const isAbortError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  return (error as { name?: unknown }).name === "AbortError";
};

const isNetworkError = (error: unknown): boolean => {
  if (isAbortError(error)) return false;
  if (error instanceof TypeError) {
    return /fetch|network|connection|timeout/i.test(error.message);
  }
  if (error instanceof ApiError && error.status === 0) {
    return true;
  }
  return false;
};

const isContractError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    message.startsWith(PRODUCTS_CONTRACT_ERROR_PREFIX)
  );
};

const classifyFailure = (
  error: unknown,
): "auth_rejected" | "unavailable" => {
  if (error instanceof ApiError && error.status === 401) {
    return "auth_rejected";
  }
  if (isContractError(error) || isNetworkError(error)) {
    return "unavailable";
  }
  return "unavailable";
};

export const resolveProductList = async (
  accessToken: string,
): Promise<ProductsListBootstrap> => {
  try {
    const page = await fetchProductList(accessToken, {
      includeInactive: true,
      cache: "no-store",
    });
    return { state: "ready", page };
  } catch (error) {
    return { state: classifyFailure(error) };
  }
};

export const resolveProductFields = async (
  accessToken: string,
  productId: number,
): Promise<ProductFieldsBootstrap> => {
  try {
    const page = await fetchProductFieldList(accessToken, {
      productId,
      includeInactive: true,
      cache: "no-store",
    });
    return { state: "ready", page };
  } catch (error) {
    return { state: classifyFailure(error) };
  }
};

export const resolveProductListFromSession =
  async (): Promise<ProductsListBootstrap> => {
    const session = await resolveSession();
    if (!session) return { state: "unavailable" };
    return resolveProductList(session.accessToken);
  };

export const resolveProductFieldsFromSession = async (
  productId: number,
): Promise<ProductFieldsBootstrap> => {
  const session = await resolveSession();
  if (!session) return { state: "unavailable" };
  return resolveProductFields(session.accessToken, productId);
};
