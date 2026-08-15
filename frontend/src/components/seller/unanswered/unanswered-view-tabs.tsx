import type { Route } from "next";
import Link from "next/link";

import type { UnansweredView } from "@/lib/seller/unanswered";
import {
  UNANSWERED_VIEW_TABS,
  unansweredWorkspaceHref,
} from "@/lib/seller/unanswered-format";
import { cn } from "@/lib/utils/cn";

/**
 * The four approved queue views. Plain links: view/selection state
 * lives in the URL so refresh/back navigation is stable and the
 * server remains the data resolver. No count badges (the list's
 * `toplam` is a page length, not a global count). Switching view drops
 * the selected question — a detail from another queue must not
 * linger — and restarts pagination from the first page.
 */
export function UnansweredViewTabs({ activeView }: { activeView: UnansweredView }) {
  return (
    <nav
      aria-label="Cevaplanamayan soru görünümü"
      className="flex flex-wrap rounded-md border border-border bg-control p-0.5"
    >
      {UNANSWERED_VIEW_TABS.map((tab) => (
        <Link
          key={tab.view}
          href={unansweredWorkspaceHref({ view: tab.view }) as Route}
          aria-current={tab.view === activeView ? "page" : undefined}
          className={cn(
            "flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-center text-[12.5px] font-medium leading-tight transition-colors md:min-h-9",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            tab.view === activeView
              ? "bg-selected text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
