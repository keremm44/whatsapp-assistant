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
      className="flex flex-wrap gap-4 border-b border-boundary"
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
