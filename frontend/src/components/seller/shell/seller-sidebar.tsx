"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { sellerNavigation } from "@/config/navigation";
import { cn } from "@/lib/utils/cn";
import { isSellerItemActive } from "@/lib/routes/active-route";

import { SellerIcon } from "./icon-map";

/**
 * Fixed-width desktop sidebar.
 *
 * 240px wide, white surface, 1px right border, no shadow. The active
 * state uses the petrol-muted background plus small left-side emphasis;
 * we do not paint the entire row in a colored pill.
 *
 * Routes that are not promoted to sidebar items (e.g. /seller/products
 * and /seller/rules under "Asistan Ayarları") still light up their
 * declared parent so the navigation hierarchy stays coherent.
 */
export function SellerSidebar() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Satıcı paneli gezinme menüsü"
      className="hidden h-screen w-[240px] shrink-0 flex-col border-r border-border bg-surface lg:sticky lg:top-0 lg:flex"
    >
      <div className="flex h-16 items-center border-b border-border px-5">
        <Link
          href="/seller"
          className="font-heading text-base font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          WhatsApp Asistan
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-6">
          {sellerNavigation.map((section) => (
            <li key={section.title}>
              <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">
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
                          "relative flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                          isActive
                            ? "bg-primary-muted font-medium text-primary"
                            : "text-foreground hover:bg-surface-2",
                        )}
                      >
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
