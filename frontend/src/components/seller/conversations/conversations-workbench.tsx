import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Conversations workbench — the correspondence desk.
 *
 * "The Working Ledger" pilot removes the heavy rounded outer-card
 * feeling. The workbench is no longer a single floating rounded block
 * containing three sub-panels; it is a set of EDGE-ALIGNED REGIONS
 * separated by structural rules, each with its own honest material:
 *
 *   LEFT    conversation queue        recessed / mineral
 *   CENTER  selected conversation     paper
 *   RIGHT   conditional context rail  paper, one tonal step down
 *
 * Only ONE boundary frames the whole desk (a top/bottom rule plus the
 * vertical rules between regions), so the eye reads columns of one
 * document rather than three cards.
 *
 * Region behavior is UNCHANGED from the previous pass:
 *
 *   Desktop (md+) — the block is height-contained so the list and the
 *   message timeline get their own scroll regions and the conversation
 *   header stays visible. Between md and xl the workbench shows list +
 *   conversation; the context opens in a Sheet from the conversation
 *   header. Three permanent columns only appear from xl.
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
        // Height containment on desktop: 100dvh minus the topbar, the
        // page's top padding and the shell main's bottom padding. The
        // regions inside scroll independently instead of stretching
        // the page.
        "md:h-[calc(100dvh-7.5rem)]",
        "md:overflow-hidden",
        // One structural boundary for the whole desk — not a card.
        "md:border-y md:border-boundary",
        "lg:grid-cols-[300px_minmax(0,1fr)]",
        hasContextRail && "xl:grid-cols-[300px_minmax(0,1fr)_320px]",
      )}
    >
      {/* Queue — recessed mineral material: it sits behind the work. */}
      <div
        className={cn(
          "flex flex-col bg-recessed md:min-h-0 md:border-r md:border-boundary",
          mobileView === "detail" && "hidden md:flex",
        )}
      >
        {list}
      </div>
      {/* Timeline — paper: this is the work surface. */}
      <div
        className={cn(
          "flex min-w-0 flex-col bg-paper md:min-h-0",
          mobileView === "list" && "hidden md:flex",
        )}
      >
        {center}
      </div>
      {/* Context — paper, one tonal step differentiated by its own
          left rule so the dossier reads as a margin, not a card. */}
      {hasContextRail ? (
        <aside
          className="scrollbar-quiet hidden min-h-0 flex-col overflow-y-auto bg-paper xl:flex xl:border-l xl:border-boundary"
          aria-label="Konuşma bağlamı"
        >
          {rail}
        </aside>
      ) : null}
    </div>
  );
}
