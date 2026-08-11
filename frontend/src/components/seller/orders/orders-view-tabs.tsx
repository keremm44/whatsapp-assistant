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
}: {
  activeView: OrderView;
  query: string | null;
}) {
  return (
    <nav
      aria-label="Sipariş görünümü"
      className="flex flex-wrap rounded-md border border-border bg-surface p-0.5"
    >
      {ORDER_VIEW_TABS.map((tab) => (
        <Link
          key={tab.view}
          href={ordersListHref({ view: tab.view, query }) as Route}
          aria-current={tab.view === activeView ? "page" : undefined}
          className={cn(
            "flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-center text-[12.5px] font-medium leading-tight transition-colors md:min-h-9",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            tab.view === activeView
              ? "bg-surface-2 text-foreground shadow-surface"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
