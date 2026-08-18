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
 * Topbar — a slim workspace rail that gets out of the way while reading.
 *
 * Downward scrolling past the opening region slides the rail above the
 * viewport; upward scrolling, returning near the top, route changes, or
 * keyboard focus reveal it immediately. The movement is transform-only
 * so it stays cheap, and reduced-motion users get an instant state change.
 */
export function SellerTopbar({
  storeName,
}: {
  /** Seller-facing store / business name returned by GET /seller/me. */
  storeName: string;
}) {
  const pathname = usePathname();
  const [isHidden, setIsHidden] = React.useState(false);
  const lastScrollY = React.useRef(0);
  const ticking = React.useRef(false);
  const frame = React.useRef<number | null>(null);

  React.useEffect(() => {
    lastScrollY.current = Math.max(window.scrollY, 0);
    setIsHidden(false);

    const update = () => {
      const nextY = Math.max(window.scrollY, 0);
      const delta = nextY - lastScrollY.current;

      if (nextY < 72) {
        setIsHidden(false);
      } else if (delta > 7) {
        setIsHidden(true);
      } else if (delta < -5) {
        setIsHidden(false);
      }

      lastScrollY.current = nextY;
      ticking.current = false;
      frame.current = null;
    };

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      frame.current = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      frame.current = null;
      ticking.current = false;
    };
  }, [pathname]);

  return (
    <header
      onFocusCapture={() => setIsHidden(false)}
      className={cn(
        "sticky top-0 z-10 border-b border-divider bg-canvas/90 backdrop-blur-md",
        "transition-[transform,opacity,box-shadow] duration-200 ease-out will-change-transform motion-reduce:transition-none",
        isHidden
          ? "pointer-events-none -translate-y-full opacity-0"
          : "translate-y-0 opacity-100 shadow-[0_8px_24px_rgba(0,0,0,0.08)]",
      )}
    >
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <TabletNavSheet />
        <p
          className="min-w-0 truncate type-row-primary text-foreground"
          title={storeName}
        >
          {storeName}
        </p>
        <span
          aria-hidden="true"
          className="ml-auto hidden items-center gap-1.5 sm:flex"
        >
          <span className="h-px w-8 bg-divider" />
          <span className="h-px w-3 bg-brand/55" />
          <span className="h-px w-5 bg-chrome-foreground/20" />
        </span>
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
          "-ml-2 hidden h-11 w-11 items-center justify-center rounded-control text-muted transition-[background-color,color,transform] duration-200 hover:scale-[1.03] hover:bg-elevated hover:text-foreground motion-reduce:transform-none md:inline-flex lg:hidden",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        )}
      >
        <SellerIcon name="Menu" size={18} />
      </SheetTrigger>
      <SheetContent
        side="left"
        className={cn(
          "w-[300px] gap-0 bg-chrome p-0 text-chrome-foreground sm:max-w-sm",
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
