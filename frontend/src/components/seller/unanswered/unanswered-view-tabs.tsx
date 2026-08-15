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
      className="flex flex-wrap gap-4 border-b border-boundary"
    >
      {UNANSWERED_VIEW_TABS.map((tab) => (
        <Link
          key={tab.view}
          href={unansweredWorkspaceHref({ view: tab.view }) as Route}
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
