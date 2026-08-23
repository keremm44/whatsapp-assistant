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
  isSellerItemActive,
  type MobileParent,
} from "@/lib/routes/active-route";
import {
  countForSellerHref,
  formatSidebarCount,
  type SellerSidebarSummary,
} from "@/lib/seller/sidebar-summary";
import { cn } from "@/lib/utils/cn";

import { SellerIcon } from "./icon-map";
import { useSellerSidebarSummary } from "./sidebar-summary-provider";

const workCount = (summary: SellerSidebarSummary | null): number | null => {
  if (!summary) return null;
  return (
    summary.returnsActionRequired +
    summary.unansweredOpen +
    summary.pausedOrTakenOver
  );
};

const CountBadge = ({ count }: { count: number | null }) =>
  count !== null && count > 0 ? (
    <span
      aria-label={`${count} açık iş`}
      className="min-w-5 rounded-full bg-accent-muted px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums text-accent-text"
    >
      {formatSidebarCount(count)}
    </span>
  ) : null;

export function SellerMobileNav() {
  const pathname = usePathname();
  const active = activeMobileParent(pathname);
  const { summary } = useSellerSidebarSummary();

  return (
    <nav
      aria-label="Alt gezinme"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-boundary bg-chrome md:hidden"
    >
      <ul className="grid grid-cols-4">
        {mobileBottomNav.map((item) => (
          <li key={item.label} className="contents">
            {item.href ? (
              <MobileNavLink item={item} isActive={active === item.label} />
            ) : (
              <MobileSheetTrigger
                item={item}
                active={active === item.label}
                pathname={pathname}
                summary={summary}
              />
            )}
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}

const MobileNavLink = ({ item, isActive }: { item: MobileNavItem; isActive: boolean }) => (
  <Link
    href={(item.href ?? "#") as Route}
    aria-current={isActive ? "page" : undefined}
    className={cn(
      "relative flex h-14 min-h-[44px] flex-col items-center justify-center gap-1 type-meta transition-colors",
      isActive
        ? "font-semibold text-chrome-foreground"
        : "text-chrome-foreground/55 hover:text-chrome-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
    )}
  >
    {isActive ? <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-primary" /> : null}
    <SellerIcon
      name={item.icon}
      size={20}
      strokeWidth={isActive ? 2 : 1.75}
      className={isActive ? "text-primary" : "text-chrome-foreground/50"}
    />
    <span>{item.label}</span>
  </Link>
);

const MobileSheetTrigger = ({
  item,
  active,
  pathname,
  summary,
}: {
  item: MobileNavItem;
  active: boolean;
  pathname: string | null;
  summary: SellerSidebarSummary | null;
}) => {
  const [open, setOpen] = React.useState(false);
  const sheetEntries = item.sheet ?? [];
  const triggerCount = item.label === "İşler" ? workCount(summary) : null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={`${item.label} menüsünü aç`}
        className={cn(
          "relative flex h-14 min-h-[44px] w-full flex-col items-center justify-center gap-1 type-meta transition-colors",
          active
            ? "font-semibold text-chrome-foreground"
            : "text-chrome-foreground/55 hover:text-chrome-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
        )}
      >
        {active ? <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-primary" /> : null}
        <span className="relative">
          <SellerIcon
            name={item.icon}
            size={20}
            strokeWidth={active ? 2 : 1.75}
            className={active ? "text-primary" : "text-chrome-foreground/50"}
          />
          {triggerCount !== null && triggerCount > 0 ? (
            <span className="absolute -right-4 -top-2">
              <CountBadge count={triggerCount} />
            </span>
          ) : null}
        </span>
        <span>{item.label}</span>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-floating bg-overlay">
        <SheetHeader>
          <SheetTitle>{item.label}</SheetTitle>
        </SheetHeader>
        <ul className="mt-2 flex flex-col">
          {sheetEntries.map((entry) => {
            const entryActive = isSellerItemActive(pathname, entry.href);
            const count = countForSellerHref(summary, entry.href);
            return (
              <li key={entry.href}>
                <Link
                  href={entry.href as Route}
                  onClick={() => setOpen(false)}
                  aria-current={entryActive ? "page" : undefined}
                  className={cn(
                    "relative flex h-12 min-h-[44px] items-center gap-3 rounded-control pl-4 pr-3 text-[15px] leading-[22px] transition-colors",
                    entryActive
                      ? "bg-selected font-semibold text-foreground"
                      : "text-foreground hover:bg-elevated",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                  )}
                >
                  {entryActive ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] rounded-l-control bg-primary" /> : null}
                  <SellerIcon
                    name={entry.icon}
                    className={entryActive ? "text-primary" : "text-muted-foreground"}
                  />
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  <CountBadge count={count} />
                </Link>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
};

export type { MobileParent };