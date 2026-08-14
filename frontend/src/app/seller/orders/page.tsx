import { OrdersProductFilter } from "@/components/seller/orders/orders-product-filter";
import { OrdersSearchForm } from "@/components/seller/orders/orders-search-form";
import { OrdersViewTabs } from "@/components/seller/orders/orders-view-tabs";
import { OrdersWorkspace } from "@/components/seller/orders/orders-workspace";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

import {
  normalizeOrderProductParam,
  normalizeOrderSearchParam,
  normalizeOrderViewParam,
} from "@/lib/seller/orders-format";
import { resolveOrderListFromSession } from "@/lib/seller/orders-server";
import { resolveProductListFromSession } from "@/lib/seller/products-server";

/**
 * Sipariş Bilgileri — the production worklist with a selected-order
 * detail surface.
 *
 * Server Component. The page answers "bu siparişte ne basacağım?"
 * through a two-pane workspace: the queue on the left (list contract
 * only — never per-row detail fetches) and the selected order's real
 * `GET /seller/orders/{id}` snapshot detail on the right (dynamic
 * field values, customer note, print content, review context).
 *
 * URL-owned state (stable across refresh/back):
 *   ?view=collecting | action_required   → the three approved tabs
 *   ?q=<marketplace order number>        → exact backend filter
 *   ?product=<real product id>           → backend product_id filter
 *   ?order=<positive id>                 → selected order (detail)
 * Offset is never in the URL: any filter change starts from the first
 * page, and filter hrefs never carry `order`, so a stale selection
 * cannot survive a filter switch.
 *
 * The product filter's options come from the existing product list
 * contract, resolved server-side alongside the first order page.
 */
export default async function SellerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = normalizeOrderViewParam(params.view);
  const query = normalizeOrderSearchParam(params.q);
  const productId = normalizeOrderProductParam(params.product);

  const [bootstrap, productsBootstrap] = await Promise.all([
    resolveOrderListFromSession({
      view,
      externalOrderNumber: query,
      productId,
    }),
    resolveProductListFromSession(),
  ]);

  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <PageHeader
        caption="İşler"
        title="Sipariş Bilgileri"
        description="Müşterilerden toplanan sipariş ve baskı bilgilerini inceleyin; üretim için gereken detayları tek yerden görün."
      />

      <div className="mt-8 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <OrdersViewTabs activeView={view} query={query} productId={productId} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <OrdersProductFilter
              bootstrap={productsBootstrap}
              view={view}
              query={query}
              productId={productId}
            />
            <OrdersSearchForm view={view} query={query} productId={productId} />
          </div>
        </div>

        <Surface className="overflow-hidden">
          <OrdersWorkspace
            bootstrap={bootstrap}
            view={view}
            query={query}
            productId={productId}
          />
        </Surface>
      </div>
    </PageContainer>
  );
}
