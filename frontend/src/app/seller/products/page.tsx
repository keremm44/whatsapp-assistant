import Link from "next/link";

import { ProductsWorkspace } from "@/components/seller/products/products-workspace";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";
import {
  normalizeProductIdParam,
  PRODUCTS_BACK_HREF,
  PRODUCTS_BACK_LABEL,
  PRODUCTS_PAGE_CAPTION,
  PRODUCTS_PAGE_DESCRIPTION,
  PRODUCTS_PAGE_TITLE,
  resolveSelectedProduct,
} from "@/lib/seller/products-format";
import {
  resolveProductFieldsFromSession,
  resolveProductListFromSession,
} from "@/lib/seller/products-server";

/**
 * Ürünler — Products V1 + product-specific personalization fields.
 *
 * Server Component. Products are loaded with include_inactive=true so
 * inactive catalog rows remain manageable. Selection is URL-owned
 * (`?product=<id>`) and must exist in the authoritative list.
 */
export default async function SellerProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedProductId = normalizeProductIdParam(params.product);
  const listBootstrap = await resolveProductListFromSession();

  const selectedId =
    listBootstrap.state === "ready"
      ? resolveSelectedProduct(listBootstrap.page.products, requestedProductId)
          ?.id ?? null
      : null;

  const fieldsBootstrap =
    selectedId === null
      ? null
      : await resolveProductFieldsFromSession(selectedId);

  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <div className="mb-4">
        <Link
          href={PRODUCTS_BACK_HREF}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {PRODUCTS_BACK_LABEL}
        </Link>
      </div>
      <PageHeader
        caption={PRODUCTS_PAGE_CAPTION}
        title={PRODUCTS_PAGE_TITLE}
        description={PRODUCTS_PAGE_DESCRIPTION}
      />
      <div className="mt-8">
        <Surface className="overflow-hidden">
          <ProductsWorkspace
            listBootstrap={listBootstrap}
            fieldsBootstrap={fieldsBootstrap}
            requestedProductId={requestedProductId}
          />
        </Surface>
      </div>
    </PageContainer>
  );
}
