import type { Route } from "next";
import Link from "next/link";

import type { OrderView } from "@/lib/seller/orders";
import { ORDER_VIEW_TABS, ordersListHref } from "@/lib/seller/orders-format";
import { cn } from "@/lib/utils/cn";

/**
 * The three approved worklist views. Plain links: the view and search
 * state live in the URL so refresh/back navigation is stable and the
 * server remains the data resolver. No count badges (they would need
 * extra requests per tab).
 */
export function OrdersViewTabs({
  activeView,
  query,
  productId,
}: {
  activeView: OrderView;
  query: string | null;
  /** Active product filter — preserved across view switches. */
  productId: number | null;
}) {
  return (
    <nav
      aria-label="Sipariş görünümü"
      className="flex flex-wrap gap-4 border-b border-boundary"
    >
      {ORDER_VIEW_TABS.map((tab) => (
        <Link
          key={tab.view}
          href={ordersListHref({ view: tab.view, query, productId }) as Route}
          aria-current={tab.view === activeView ? "page" : undefined}
          className={cn(
            // Open underline tab: neutral background, cyan rule only.
            "-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 border-transparent px-0.5 pb-2 pt-1 text-[12.5px] leading-tight transition-colors md:min-h-9",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
            tab.view === activeView
              ? "border-primary font-semibold text-foreground"
              : "font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
