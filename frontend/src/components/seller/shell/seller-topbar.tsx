"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils/cn";

import { SellerIcon } from "./icon-map";
import { SidebarSections } from "./seller-sidebar";

/**
 * Topbar — the slim workspace rail.
 *
 * The rail belongs to the WORK, not to the navigation frame, so it
 * sits on the canvas material (one step above the spine) with a
 * single structural rule beneath it. It stays deliberately thin:
 * every pixel it takes is a pixel the ledger does not get.
 *
 *   - Left: the seller's real bootstrap identity (the store name from
 *     `GET /seller/me`). The decorative "Mağaza" chip stays removed —
 *     it restated the adjacent label and carried no backend state.
 *     No truthful business identity or data is lost.
 *
 *   - Tablet only (md to lg): a Menu trigger opens the same
 *     navigation in a Sheet, rendering the spine material and the
 *     identical section list as the desktop spine
 *     (`SidebarSections`), so tablet and desktop can never drift.
 *
 *   - No fabricated utility chrome: no notifications, no
 *     announcements, no assistant health. Those have no seller-facing
 *     backend contract.
 */
export function SellerTopbar({
  storeName,
}: {
  /**
   * The seller-facing store / business name returned by
   * `GET /seller/me`. The layout is responsible for resolving
   * the bootstrap state and passing either the real name or the
   * approved generic fallback; this component does not invent
   * labels.
   */
  storeName: string;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-divider bg-canvas">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <TabletNavSheet />
        <p
          className="min-w-0 truncate type-row-primary text-foreground"
          title={storeName}
        >
          {storeName}
        </p>
      </div>
    </header>
  );
}

const TabletNavSheet = () => {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Menüyü aç"
        className={cn(
          "-ml-2 hidden h-11 w-11 items-center justify-center rounded-control text-muted transition-colors hover:bg-elevated hover:text-foreground md:inline-flex lg:hidden",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        )}
      >
        <SellerIcon name="Menu" size={18} />
      </SheetTrigger>
      <SheetContent
        side="left"
        className={cn(
          "w-[300px] gap-0 bg-chrome p-0 text-chrome-foreground sm:max-w-sm",
          // The Sheet's own close control inherits paper-theme ink;
          // on the dark spine material it needs the chrome ink role
          // to stay legible and to keep a visible hover step.
          "[&>button]:text-chrome-foreground/70 [&>button:hover]:text-chrome-foreground",
        )}
      >
        <SheetHeader className="px-5 pb-4 pt-6">
          <span
            aria-hidden="true"
            className="mb-1 flex h-9 w-9 items-center justify-center rounded-control border border-brand/40 bg-brand/15 text-brand"
          >
            <SellerIcon name="Store" size={18} strokeWidth={2} />
          </span>
          <SheetTitle className="font-display text-[15px] font-semibold tracking-[-0.012em] text-chrome-foreground">
            WhatsApp Asistan
          </SheetTitle>
          <span className="type-meta text-chrome-foreground/50">
            Mağaza yönetimi
          </span>
        </SheetHeader>
        <nav
          aria-label="Satıcı paneli gezinme menüsü"
          className="flex-1 overflow-y-auto px-3 py-4"
        >
          <SidebarSections
            pathname={pathname}
            onNavigate={() => setOpen(false)}
          />
        </nav>
      </SheetContent>
    </Sheet>
  );
};
