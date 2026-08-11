import { OrdersListPanel } from "@/components/seller/orders/orders-list-panel";
import { OrdersSearchForm } from "@/components/seller/orders/orders-search-form";
import { OrdersViewTabs } from "@/components/seller/orders/orders-view-tabs";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";

import {
  normalizeOrderSearchParam,
  normalizeOrderViewParam,
} from "@/lib/seller/orders-format";
import { resolveOrderListFromSession } from "@/lib/seller/orders-server";

/**
 * Sipariş Bilgileri — the V1 production / print-content worklist.
 *
 * Server Component. The page answers one question at a glance:
 * "Bu siparişte ne basacağım?" — Telefon → Sipariş No → Baskı içeriği,
 * backed only by `GET /seller/orders`.
 *
 * URL-owned state (stable across refresh/back):
 *   ?view=collecting | action_required   → the three approved tabs
 *   ?q=<marketplace order number>        → exact backend filter
 * Offset is never in the URL: switching view or search starts from the
 * first page (pagination reset) by construction.
 *
 * There is deliberately no per-row detail fetch, no status tab beyond
 * the approved three, and no KPI chrome above the list.
 */
export default async function SellerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = normalizeOrderViewParam(params.view);
  const query = normalizeOrderSearchParam(params.q);

  const bootstrap = await resolveOrderListFromSession({
    view,
    externalOrderNumber: query,
  });

  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption="İşler"
        title="Sipariş Bilgileri"
        description="Müşterilerden toplanan sipariş ve baskı bilgilerini tek listede görüntüleyin."
      />

      <div className="mt-8 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <OrdersViewTabs activeView={view} query={query} />
          <OrdersSearchForm view={view} query={query} />
        </div>

        <Surface className="overflow-hidden">
          <OrdersListPanel bootstrap={bootstrap} view={view} query={query} />
        </Surface>
      </div>
    </PageContainer>
  );
}
