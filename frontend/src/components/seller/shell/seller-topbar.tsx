"use client";

import * as React from "react";
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
 * Minimal topbar.
 *
 * 64px tall, warm chrome surface, 1px bottom border. The left side
 * shows a neutral "Mağaza" placeholder until real seller/store
 * identity is wired by a later auth step. The right side offers a
 * single safe navigation target: /seller/settings.
 *
 * No notification bell, no global search, no assistant switch, no
 * fake avatar — those arrive with the real contracts.
 */
export function SellerTopbar() {
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-chrome px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <TabletNavSheet open={menuOpen} onOpenChange={setMenuOpen} />
        <p className="font-heading text-base font-semibold text-foreground">
          Mağaza
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/seller/settings"
          className="text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
        >
          Ayarlar
        </Link>
      </div>
    </header>
  );
}

const TabletNavSheet = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        aria-label="Menüyü aç"
        className={cn(
          "hidden h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-surface-2 md:inline-flex lg:hidden",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome",
        )}
      >
        <SellerIcon name="Menu" size={22} />
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] bg-chrome sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Menü</SheetTitle>
        </SheetHeader>
        <SidebarNavList
          pathname={pathname}
          onNavigate={() => onOpenChange(false)}
          className="mt-2"
        />
      </SheetContent>
    </Sheet>
  );
};

/**
 * Sidebar-style nav list, used inside the tablet menu Sheet. Renders
 * the same three sections as the desktop sidebar and highlights the
 * current destination using the shared active-route helper.
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
      <ul className="flex flex-col gap-5">
        {sellerNavigation.map((section, index) => (
          <li
            key={section.title}
            className={cn(index > 0 && "border-t border-divider pt-4")}
          >
            <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">
              {section.title}
            </p>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const isActive = isSellerItemActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative flex h-11 items-center gap-3 rounded-md pl-4 pr-3 text-sm transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome",
                        isActive
                          ? "bg-primary-muted font-medium text-primary"
                          : "text-foreground hover:bg-surface-2",
                      )}
                    >
                      {isActive ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-primary"
                        />
                      ) : null}
                      <SellerIcon
                        name={item.icon}
                        className={
                          isActive
                            ? "text-primary"
                            : "text-muted-foreground"
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
