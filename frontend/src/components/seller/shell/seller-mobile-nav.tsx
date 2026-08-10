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
import { mobileBottomNav, type MobileNavItem } from "@/config/navigation";
import {
  activeMobileParent,
  type MobileParent,
} from "@/lib/routes/active-route";
import { cn } from "@/lib/utils/cn";

import { SellerIcon } from "./icon-map";

/**
 * Mobile bottom navigation.
 *
 * Visible only below the `md` breakpoint. Four primary destinations:
 * Genel, Konuşmalar, İşler, Diğer. "İşler" and "Diğer" open a Sheet
 * rather than navigating to a single URL.
 *
 * Uses the warm chrome surface so the navigation belongs to the same
 * shell system as the desktop sidebar and topbar.
 */
export function SellerMobileNav() {
  const pathname = usePathname();
  const active = activeMobileParent(pathname);

  return (
    <nav
      aria-label="Alt gezinme"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-chrome md:hidden"
    >
      <ul className="grid grid-cols-4">
        {mobileBottomNav.map((item) => (
          <li key={item.label} className="contents">
            {item.href ? (
              <MobileNavLink
                item={item}
                isActive={active === item.label}
              />
            ) : (
              <MobileSheetTrigger
                item={item}
                active={active === item.label}
                pathname={pathname}
              />
            )}
          </li>
        ))}
      </ul>
      {/* Safe area spacer for iOS-style home indicator environments. */}
      <div aria-hidden="true" className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}

const MobileNavLink = ({
  item,
  isActive,
}: {
  item: MobileNavItem;
  isActive: boolean;
}) => (
  <Link
    href={(item.href ?? "#") as Route}
    aria-current={isActive ? "page" : undefined}
    className={cn(
      "flex h-14 min-h-[44px] flex-col items-center justify-center gap-1 text-xs transition-colors",
      isActive
        ? "bg-primary-muted font-semibold text-primary"
        : "text-muted-foreground hover:text-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome",
    )}
  >
    <SellerIcon
      name={item.icon}
      size={20}
      className={isActive ? "text-primary" : "text-muted-foreground"}
    />
    <span>{item.label}</span>
  </Link>
);

const MobileSheetTrigger = ({
  item,
  active,
  pathname,
}: {
  item: MobileNavItem;
  active: boolean;
  pathname: string | null;
}) => {
  const [open, setOpen] = React.useState(false);
  const sheetEntries = item.sheet ?? [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={`${item.label} menüsünü aç`}
        className={cn(
          "flex h-14 min-h-[44px] flex-col items-center justify-center gap-1 text-xs transition-colors",
          active
            ? "font-semibold text-primary"
            : "text-muted-foreground hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome",
        )}
      >
        <SellerIcon
          name={item.icon}
          size={20}
          className={active ? "text-primary" : "text-muted-foreground"}
        />
        <span>{item.label}</span>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[80vh] rounded-t-md bg-chrome"
      >
        <SheetHeader>
          <SheetTitle>{item.label}</SheetTitle>
        </SheetHeader>
        <ul className="mt-2 flex flex-col">
          {sheetEntries.map((entry) => {
            const entryActive = isEntryActive(pathname, entry.href);
            return (
              <li key={entry.href}>
                <Link
                  href={entry.href as Route}
                  onClick={() => setOpen(false)}
                  aria-current={entryActive ? "page" : undefined}
                  className={cn(
                    "relative flex h-12 min-h-[44px] items-center gap-3 rounded-md pl-4 pr-3 text-sm transition-colors",
                    entryActive
                      ? "bg-primary-muted font-medium text-primary"
                      : "text-foreground hover:bg-surface-2",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome",
                  )}
                >
                  {entryActive ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-primary"
                    />
                  ) : null}
                  <SellerIcon
                    name={entry.icon}
                    className={
                      entryActive ? "text-primary" : "text-muted-foreground"
                    }
                  />
                  <span>{entry.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
};

const isEntryActive = (
  pathname: string | null,
  href: string,
): boolean => {
  if (!pathname) return false;
  if (href === "/seller") return pathname === "/seller";
  return pathname === href || pathname.startsWith(`${href}/`);
};

export type { MobileParent };
