"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { sellerNavigation } from "@/config/navigation";
import { isSellerItemActive } from "@/lib/routes/active-route";
import { cn } from "@/lib/utils/cn";

import { SellerIcon } from "./icon-map";

/**
 * Topbar.
 *
 * Visual identity (this pass):
 *
 *   - Same chrome surface as the sidebar. The topbar and the
 *     sidebar form a single L-shaped chrome surface around
 *     the linen content canvas, so the product shell reads
 *     as one piece.
 *
 *   - The left side shows the seller's bootstrap identity:
 *     the store name in Manrope medium, with a small
 *     petrol-on-chrome `Mağaza` chip right next to it. The
 *     chip is a deliberate, restrained petrol cue that ties
 *     the topbar visually to the sidebar's brand mark.
 *
 *   - The right side exposes a single safe navigation
 *     destination (`/seller/settings`). The link uses petrol
 *     text + a small chevron, so the action affordance is
 *     visible without being loud.
 *
 *   - Tablet only (md to lg): the same topbar exposes a
 *     sidebar-shaped Menu trigger on the far left so the
 *     tablet Sheet is the navigation fallback. The trigger
 *     uses a petrol-soft square, not a bare icon, so it
 *     reads as the same component family as the sidebar
 *     brand mark.
 *
 *   - No fake status chips, no notification bells, no
 *     assistant health. We do not have any real data on
 *     those surfaces, and inventing them is forbidden.
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
    <header className="sticky top-0 z-10 border-b border-border bg-chrome">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <TabletNavSheet />
          <p
            className="truncate font-heading text-[15px] font-semibold text-foreground"
            title={storeName}
          >
            {storeName}
          </p>
          <span
            aria-hidden="true"
            className="hidden h-4 w-px bg-divider sm:block"
          />
          <span className="hidden h-6 items-center rounded-pill bg-primary-muted px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-primary sm:inline-flex">
            Mağaza
          </span>
        </div>

        <div className="flex items-center">
          <Link
            href="/seller/settings"
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
          >
            <span>Ayarlar</span>
            <SellerIcon
              name="Settings"
              size={14}
              className="text-primary"
            />
          </Link>
        </div>
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
          "hidden h-9 w-9 items-center justify-center rounded-md bg-primary-muted text-primary transition-colors hover:bg-primary-muted/70 md:inline-flex lg:hidden",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome",
        )}
      >
        <SellerIcon name="Menu" size={18} />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[300px] gap-0 bg-chrome p-0 sm:max-w-sm"
      >
        <SheetHeader className="border-b border-border px-5 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground"
            >
              <SellerIcon name="Store" size={18} strokeWidth={1.7} />
            </span>
            <div className="flex flex-col leading-tight">
              <SheetTitle className="text-[15px] font-semibold">
                WhatsApp Asistan
              </SheetTitle>
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Mağaza yönetimi
              </span>
            </div>
          </div>
        </SheetHeader>
        <SidebarNavList
          pathname={pathname}
          onNavigate={() => setOpen(false)}
          className="flex-1 overflow-y-auto px-3 py-5"
        />
      </SheetContent>
    </Sheet>
  );
};

/**
 * Sidebar-style nav list, used inside the tablet menu Sheet. Renders
 * the same three sections as the desktop sidebar and highlights the
 * current destination using the shared active-route helper. The
 * active state matches the desktop sidebar's marker pattern so the
 * seller gets the same visual language on tablet as on desktop.
 */
function SidebarNavList({
  pathname,
  onNavigate,
  className,
}: {
  pathname: string | null;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav aria-label="Satıcı paneli gezinme menüsü" className={className}>
      <ul className="flex flex-col gap-1">
        {sellerNavigation.map((section, index) => (
          <li
            key={section.title}
            className={cn(index > 0 && "mt-1 border-t border-divider pt-4")}
          >
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
              {section.title}
            </p>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const isActive = isSellerItemActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href as Route}
                      onClick={onNavigate}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative flex h-10 items-center gap-3 rounded-md pl-4 pr-3 text-sm transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome",
                        isActive
                          ? "bg-primary-muted font-semibold text-primary"
                          : "text-foreground hover:bg-surface-2",
                      )}
                    >
                      {isActive ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-2.5 left-0 w-[2px] rounded-full bg-primary"
                        />
                      ) : null}
                      <SellerIcon
                        name={item.icon}
                        className={
                          isActive ? "text-primary" : "text-muted-foreground"
                        }
                      />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}