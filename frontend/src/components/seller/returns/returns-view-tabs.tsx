import type { Route } from "next";
import Link from "next/link";

import type { ReturnIssueType, ReturnView } from "@/lib/seller/returns";
import {
  RETURN_VIEW_TABS,
  returnsWorkspaceHref,
} from "@/lib/seller/returns-format";
import { cn } from "@/lib/utils/cn";

/**
 * The four approved queue views. Plain links: view/search/type state
 * lives in the URL so refresh/back navigation is stable and the server
 * remains the data resolver. No count badges (they would need extra
 * requests per tab and the list's `toplam` is not a global count).
 * Switching view drops the selected request — a request from another
 * queue must not linger in the detail area.
 */
export function ReturnsViewTabs({
  activeView,
  query,
  issueType,
}: {
  activeView: ReturnView;
  query: string | null;
  issueType: ReturnIssueType | null;
}) {
  return (
    <nav
      aria-label="İade ve sorun görünümü"
      className="flex flex-wrap rounded-md border border-border bg-surface p-0.5"
    >
      {RETURN_VIEW_TABS.map((tab) => (
        <Link
          key={tab.view}
          href={
            returnsWorkspaceHref({
              view: tab.view,
              query,
              issueType,
            }) as Route
          }
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
