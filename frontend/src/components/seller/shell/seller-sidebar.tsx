"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { sellerNavigation } from "@/config/navigation";
import { isSellerItemActive } from "@/lib/routes/active-route";
import { cn } from "@/lib/utils/cn";

import { SellerIcon } from "./icon-map";

/**
 * Desktop sidebar.
 *
 * Visual identity (this pass):
 *
 *   - 232px wide. Linen canvas outside, chrome surface inside.
 *     The sidebar is the only chrome surface in the seller
 *     shell; everything else (topbar, dashboard) is linen.
 *     This makes the sidebar read as the persistent control
 *     surface of the product.
 *
 *   - Brand mark area. A small petrol-soft square with a
 *     petrol `Store` glyph sits at the top-left. The square
 *     is the product's silent logo — a recognisable mark the
 *     user can identify without reading the wordmark. Next to
 *     it sits the wordmark ("WhatsApp Asistan") in Manrope,
 *     plus a small "Mağaza yönetimi" eyebrow underneath in
 *     muted ink. A 1px petrol hairline divides the brand
 *     block from navigation.
 *
 *   - Section rhythm. Each group is separated by a quiet
 *     hairline (not a heavy band). Section labels are
 *     uppercase, petrol, tracking-wide, 11px. The label
 *     carries the petrol cue so the navigation reads as a
 *     branded product, not a generic admin menu.
 *
 *   - Selected state. A combination of: 2px petrol rail on the
 *     left edge (rendered as a 2px-wide, 24px-tall vertical
 *     bar that sits flush against the row's left padding),
 *     petrol-soft background, petrol icon, petrol text,
 *     medium weight. This is intentionally more crafted than
 *     the previous "rounded rectangle with a 2px bar" — the
 *     bar now reads as an active marker, the row's background
 *     softens, and the typography gains a half-step of
 *     weight.
 *
 *   - Hover. Rows fade to a slightly darker linen (the
 *     `surface-2` token) on hover. Icons move from muted to
 *     foreground to communicate affordance.
 *
 *   - Bottom settings region. A small section at the bottom
 *     points at the existing /seller/settings surface with a
 *     neutral Settings icon — never a fabricated initial or
 *     unsupported profile/team/integration promise.
 */
export function SellerSidebar() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Satıcı paneli gezinme menüsü"
      className="hidden h-screen w-[232px] shrink-0 flex-col border-r border-border bg-chrome lg:sticky lg:top-0 lg:flex"
    >
      <BrandMark />
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <ul className="flex flex-col gap-1">
          {sellerNavigation.map((section, index) => (
            <li
              key={section.title}
              className={cn(
                index > 0 &&
                  "mt-1 border-t border-divider pt-4",
              )}
            >
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-text">
                {section.title}
              </p>
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <NavRow
                    key={item.href}
                    href={item.href as Route}
                    icon={item.icon}
                    label={item.label}
                    isActive={isSellerItemActive(pathname, item.href)}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </nav>
      <BottomRail />
    </aside>
  );
}

const BrandMark = () => (
  <div className="border-b border-border px-5 pb-5 pt-5">
    <Link
      href="/seller"
      className="group flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
    >
      {/*
       * Brand mark. The petrol square is the dominant brand
       * surface; the small terracotta corner square is a
       * restrained second brand character. Together they
       * form the product's silent logo: petrol on the left,
       * warm on the right.
       */}
      <span className="flex items-center" aria-hidden="true">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <SellerIcon name="Store" size={18} strokeWidth={1.7} />
        </span>
        <span className="-ml-1.5 h-9 w-3 rounded-md rounded-l-none bg-accent" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-heading text-[15px] font-semibold text-foreground">
          WhatsApp Asistan
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Mağaza yönetimi
        </span>
      </span>
    </Link>
    {/*
     * Brand hairline. Petrol is the control color; terracotta
     * is the small warm signature. The two segments are
     * deliberately thin and short so the detail reads as
     * decorative brand identity, not as a status indicator.
     */}
    <span aria-hidden="true" className="mt-4 flex items-center gap-1">
      <span className="block h-px w-7 bg-primary" />
      <span className="block h-px w-2 bg-accent" />
    </span>
  </div>
);

const NavRow = ({
  href,
  icon,
  label,
  isActive,
}: {
  href: Route;
  icon: React.ComponentProps<typeof SellerIcon>["name"];
  label: string;
  isActive: boolean;
}) => {
  return (
    <li>
      <Link
        href={href}
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
          name={icon}
          className={cn(
            isActive ? "text-primary" : "text-muted-foreground",
            "transition-colors",
          )}
        />
        <span>{label}</span>
      </Link>
    </li>
  );
};

const BottomRail = () => {
  /*
   * Account / settings region. The terracotta-soft surface
   * is the second visible brand color in the product. It
   * sits at the bottom of the sidebar as a quiet
   * "this is your workspace" surface, balancing the
   * petrol brand mark at the top.
   */
  return (
    <div className="border-t border-border bg-accent-muted/85 px-4 py-4">
      <Link
        href="/seller/settings"
        className="flex items-center gap-3 rounded-md px-1 py-1 text-sm text-foreground/80 transition-colors hover:bg-surface/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-accent-muted"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground"
        >
          <SellerIcon name="Settings" size={16} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[13px] font-medium text-foreground">
            Ayarlar
          </span>
          <span className="text-[11px] text-muted-foreground">
            Oturum
          </span>
        </span>
      </Link>
    </div>
  );
};
