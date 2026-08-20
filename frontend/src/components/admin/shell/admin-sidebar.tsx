"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * Admin sidebar (desktop, >= 1024px).
 *
 * 240px wide, warm chrome surface, 1px right border, no shadow.
 * Visually mirrors the seller sidebar so the two surfaces read
 * as one product, but the information architecture is
 * intentionally minimal: one section ("Yönetim"), one item
 * ("Mağazalar").
 *
 * Admin navigation is hard-coded here rather than driven by
 * `config/navigation.ts` because the seller config carries
 * many destinations that have no place in the admin surface
 * and coupling admin to it would invite accidental reuse.
 *
 * The active destination uses the same restrained petrol
 * indicator + petrol-muted background + primary text + icon
 * treatment as the seller sidebar so the two surfaces feel
 * like one product.
 */
export function AdminSidebar() {
  const pathname = usePathname();
  const isActive = pathname === "/admin";

  return (
    <aside
      aria-label="Yönetim paneli gezinme menüsü"
      className="hidden h-screen w-[240px] shrink-0 flex-col border-r border-border bg-chrome lg:sticky lg:top-0 lg:flex"
    >
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <span
          aria-hidden="true"
          className="block h-[20px] w-[2px] rounded-full bg-primary"
        />
        <p className="font-heading text-[15px] font-semibold text-primary">
          Yönetim
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">
          Yönetim
        </p>
        <ul className="flex flex-col gap-0.5">
          <li>
            <Link
              href={"/admin" as Route}
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
              <LayoutDashboard
                aria-hidden="true"
                size={20}
                strokeWidth={1.75}
                className={cn(
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span>Genel Bakış</span>
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
