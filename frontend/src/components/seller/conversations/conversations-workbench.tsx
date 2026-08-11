import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Conversations workbench — the L1 operational layout.
 *
 * One coherent tool surface, not three unrelated cards: a single
 * bordered block whose regions are separated by hairline dividers and
 * differentiated only by the workspace's existing depth tokens:
 *
 *   LEFT    conversation queue        browser chrome token (bg-chrome)
 *   CENTER  selected conversation     workspace canvas (bg-background)
 *   RIGHT   conditional context rail  raised surface (bg-surface)
 *
 * Region behavior:
 *
 *   Desktop (md+) — the block is height-contained so the list and the
 *   message timeline get their own scroll regions and the conversation
 *   header stays visible. The width math follows the seller shell:
 *   the shell's sidebar is 240px from lg up, so three permanent
 *   columns only fit comfortably from xl (1280px+). Between md and xl
 *   the workbench shows list + conversation; the context opens in a
 *   Sheet from the conversation header.
 *
 *   Mobile (< md) — the block degrades to a plain, borderless page
 *   region; only one region renders per route. The index route
 *   (`mobileView: "list"`) shows the queue; the detail route
 *   (`mobileView: "detail"`) shows the conversation full-width with a
 *   back affordance. Nothing creates a nested scroll trap on small
 *   screens — the page scrolls naturally.
 *
 * The right rail is CONDITIONAL: callers render it only when the
 * selected conversation actually carries work context (active order,
 * active return/issue, or open unanswered questions). No context means
 * no rail — the conversation column expands, and no dead empty panel
 * occupies space.
 */
export function ConversationsWorkbench({
  mobileView,
  hasContextRail,
  list,
  center,
  rail,
}: {
  /** Which region owns the small-screen presentation for this route. */
  mobileView: "list" | "detail";
  hasContextRail: boolean;
  list: React.ReactNode;
  center: React.ReactNode;
  rail?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "md:grid md:grid-cols-[290px_minmax(0,1fr)]",
        // Height containment on desktop: 100dvh minus the 64px topbar,
        // the page's 24px top padding (md:pt-6) and the shell main's
        // 40px bottom padding (md:pb-10). The regions inside scroll
        // independently instead of stretching the page.
        "md:h-[calc(100dvh-8rem)]",
        "md:overflow-hidden md:rounded-md md:border md:border-border md:bg-surface md:shadow-surface",
        "lg:grid-cols-[300px_minmax(0,1fr)]",
        hasContextRail && "xl:grid-cols-[300px_minmax(0,1fr)_320px]",
      )}
    >
      <div
        className={cn(
          "flex flex-col bg-chrome md:min-h-0 md:border-r md:border-divider",
          mobileView === "detail" && "hidden md:flex",
        )}
      >
        {list}
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-col bg-background md:min-h-0",
          mobileView === "list" && "hidden md:flex",
        )}
      >
        {center}
      </div>
      {hasContextRail ? (
        <aside
          className="hidden min-h-0 flex-col overflow-y-auto border-l border-divider bg-surface xl:flex"
          aria-label="Konuşma bağlamı"
        >
          {rail}
        </aside>
      ) : null}
    </div>
  );
}
