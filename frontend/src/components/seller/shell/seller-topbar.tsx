"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { sellerNavigation } from "@/config/navigation";
import { cn } from "@/lib/utils/cn";

import { SellerIcon } from "./icon-map";

/**
 * Minimal topbar.
 *
 * 64px tall, white surface, 1px bottom border. The left side shows a
 * neutral "Mağaza" placeholder until real seller/store identity is wired
 * by a later auth step.
 *
 * The right side offers a single safe navigation target: /seller/settings.
 * No notification bell, no global search, no assistant switch — those
 * arrive with the real contracts.
 */
export function SellerTopbar() {
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-surface px-4 sm:px-6">
      <div className="flex items-center gap-2">
        {/* Tablet menu trigger (visible below lg). On desktop the sidebar
            is always present so the trigger is hidden. */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger
            aria-label="Menüyü aç"
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-surface-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              "lg:hidden",
            )}
          >
            <SellerIcon name="Settings2" size={20} />
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] sm:max-w-sm">
            <SheetHeader>
              <SheetTitle>Menü</SheetTitle>
            </SheetHeader>
            <SidebarNavList
              onNavigate={() => setMenuOpen(false)}
              className="mt-2"
            />
          </SheetContent>
        </Sheet>
        <p className="font-heading text-base font-semibold text-foreground">
          Mağaza
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/seller/settings">Ayarlar</Link>
        </Button>
        <div
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-medium text-muted-foreground"
        >
          M
        </div>
      </div>
    </header>
  );
}

/**
 * Sidebar-style nav list, used inside the tablet menu sheet. Renders the
 * same three sections as the desktop sidebar.
 */
function SidebarNavList({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav aria-label="Satıcı paneli gezinme menüsü" className={className}>
      <ul className="flex flex-col gap-4">
        {sellerNavigation.map((section) => (
          <li key={section.title}>
            <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              {section.title}
            </p>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex h-11 items-center gap-3 rounded-md px-3 text-sm text-foreground transition-colors hover:bg-surface-2",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    )}
                  >
                    <SellerIcon
                      name={item.icon}
                      className="text-muted-foreground"
                    />
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
