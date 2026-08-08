"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { sellerNavigation } from "@/config/navigation";
import { isSellerItemActive } from "@/lib/routes/active-route";
import { cn } from "@/lib/utils/cn";

import { SellerIcon } from "./icon-map";

/**
 * Fixed-width desktop sidebar.
 *
 * 240px wide, warm chrome surface (`#FAF8F3`), 1px right border, no shadow.
 *
 * The active row uses:
 *   - 2px petrol indicator on the left edge (integrated, not a sidebar)
 *   - petrol-tinted background
 *   - petrol text and icon
 *
 * Inactive hover uses a subtle warm surface-2 wash that is always weaker
 * than the active state.
 */
export function SellerSidebar() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Satıcı paneli gezinme menüsü"
      className="hidden h-screen w-[240px] shrink-0 flex-col border-r border-border bg-chrome lg:sticky lg:top-0 lg:flex"
    >
      <div className="flex h-16 items-center border-b border-border px-5">
        <Link
          href="/seller"
          className="font-heading text-[15px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
        >
          WhatsApp Asistan
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-6">
          {sellerNavigation.map((section) => (
            <li key={section.title}>
              <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">
                {section.title}
              </p>
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const isActive = isSellerItemActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
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
                          className={cn(
                            isActive
                              ? "text-primary"
                              : "text-muted-foreground",
                          )}
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
    </aside>
  );
}
