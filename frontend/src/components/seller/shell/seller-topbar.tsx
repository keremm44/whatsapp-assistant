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
 *   - The right side carries the utility pair, ordered by
 *     visual weight:
 *
 *       "Duyurular" announcements preview — a quiet raised
 *       chip inside the chrome bar (bordered surface, petrol
 *       eyebrow). It is MORE visible than the bell but calmer
 *       than a banner. It renders only its label until a real
 *       announcement title is provided: there is no backend
 *       announcements contract yet, so the UI never fabricates
 *       one — no placeholder copy, no "new" dot, no count.
 *       Terracotta is deliberately absent here so the surface
 *       never reads as urgent or as a notification state.
 *
 *       "Bildirimler" bell — a compact, quieter icon control
 *       at the far right. Backend notification persistence
 *       exists, but the seller-facing list/read contract is
 *       not yet available, so this is the presentation slot
 *       only: no badge, no unread count, no fabricated
 *       dropdown content. Wiring lands with the contract.
 *
 *   - Tablet only (md to lg): the same topbar exposes a
 *     sidebar-shaped Menu trigger on the far left so the
 *     tablet Sheet is the navigation fallback. The trigger
 *     uses a petrol-soft square, not a bare icon, so it
 *     reads as the same component family as the sidebar
 *     brand mark.
 *
 *   - No fake status chips, no assistant health. We do not
 *     have any real data on those surfaces, and inventing
 *     them is forbidden.
 */
export function SellerTopbar({
  storeName,
  announcementTitle = null,
}: {
  /**
   * The seller-facing store / business name returned by
   * `GET /seller/me`. The layout is responsible for resolving
   * the bootstrap state and passing either the real name or the
   * approved generic fallback; this component does not invent
   * labels.
   */
  storeName: string;
  /**
   * Optional short title of the latest relevant announcement.
   * There is no backend announcements contract yet, so callers
   * pass nothing and the preview renders its label only. When a
   * contract exists the layout may pass the real title; the
   * surface must render sensibly in both states.
   */
  announcementTitle?: string | null;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-chrome">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
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
          <span className="hidden h-6 shrink-0 items-center rounded-pill bg-primary-muted px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-primary-text sm:inline-flex">
            Mağaza
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <AnnouncementsPreview title={announcementTitle} />
          <NotificationsButton />
        </div>
      </div>
    </header>
  );
}

/**
 * Announcements preview surface ("Duyurular").
 *
 * Presentational slot reserved for the future seller-announcements
 * contract. When `title` is absent (always, until the contract
 * exists) only the calm label renders; when a real title arrives it
 * appears next to the label, truncated within desktop widths and
 * hidden below `sm` so narrow topbars stay clean. Non-interactive
 * by design until the future destination/contract is defined.
 */
function AnnouncementsPreview({ title }: { title?: string | null }) {
  const hasTitle = typeof title === "string" && title.trim().length > 0;
  return (
    <div
      aria-label="Duyurular"
      className="flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-2.5 shadow-surface sm:gap-2.5 sm:px-3"
    >
      <SellerIcon
        name="Megaphone"
        size={16}
        className="shrink-0 text-primary"
      />
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-primary-text">
        Duyurular
      </span>
      {hasTitle ? (
        <>
          <span
            aria-hidden="true"
            className="hidden h-3.5 w-px bg-divider sm:block"
          />
          <span
            title={title}
            className="hidden max-w-[180px] truncate text-[13px] font-medium text-foreground/85 sm:block lg:max-w-[240px]"
          >
            {title}
          </span>
        </>
      ) : null}
    </div>
  );
}

/**
 * Notifications control position ("Bildirimler").
 *
 * The deliberate end of the topbar's right side: visually smaller
 * and quieter than the announcements surface. No badge or count is
 * rendered — an unread number is real data and the seller-facing
 * contract does not exist yet.
 */
function NotificationsButton() {
  return (
    <button
      type="button"
      aria-label="Bildirimler"
      title="Bildirimler"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
    >
      <SellerIcon name="Bell" size={18} />
    </button>
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
          "hidden h-9 w-9 items-center justify-center rounded-md bg-primary-muted text-primary-text transition-colors hover:bg-primary-muted/70 md:inline-flex lg:hidden",
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
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-text">
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
                          ? "bg-primary-muted font-semibold text-primary-text"
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