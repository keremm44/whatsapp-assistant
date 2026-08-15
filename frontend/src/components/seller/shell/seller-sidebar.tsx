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
 * Desktop navigation spine — "The Working Ledger" pilot.
 *
 * The spine is the one dark ink surface in the seller workspace. It
 * frames a light mineral canvas the way the spine of a ledger frames
 * its pages: permanent, quiet, and unmistakably separate from the
 * work.
 *
 *   - 232px wide (unchanged; the information architecture is not
 *     disturbed by this pilot). Spacing inside is slightly more
 *     generous so the spine reads as intentional rather than dense.
 *
 *   - Brand. The previous petrol square + decorative terracotta
 *     appendage + two-segment brand hairline are gone. What remains
 *     is the wordmark itself, set on chrome ink. No color is spent on
 *     decoration, so the only colored things in the spine are the
 *     active-destination markers.
 *
 *   - Section labels are sentence case in a quiet chrome ink, not
 *     uppercase petrol micro-captions.
 *
 *   - Active destination is a PAPER INDEX TAB pressed into the dark
 *     spine: paper material, dark semibold ink, an interaction-blue
 *     icon and a blue marker rule on the leading edge. The state is
 *     therefore carried by shape + luminance + weight + a marker,
 *     never by hue alone, and it is announced with aria-current.
 *
 *   - Hover on inactive rows uses the chrome hover step only.
 *
 *   - There is deliberately no bottom settings/account rail; Ayarlar
 *     already lives in the normal navigation.
 */
export function SellerSidebar() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Satıcı paneli gezinme menüsü"
      className="hidden h-screen w-[232px] shrink-0 flex-col bg-chrome text-chrome-foreground lg:sticky lg:top-0 lg:flex"
    >
      <BrandMark />
      <nav className="flex-1 overflow-y-auto px-3 py-6">
        <SidebarSections pathname={pathname} />
      </nav>
    </aside>
  );
}

const BrandMark = () => (
  <div className="px-5 pb-5 pt-6">
    <Link
      href="/seller"
      className="block rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
    >
      <span className="block font-heading text-[15px] font-semibold leading-tight tracking-[0.01em] text-chrome-foreground">
        WhatsApp Asistan
      </span>
      <span className="mt-0.5 block type-meta text-chrome-foreground/55">
        Mağaza yönetimi
      </span>
    </Link>
  </div>
);

/**
 * The shared navigation body. Rendered identically in the desktop
 * spine and in the tablet navigation Sheet so the two can never
 * drift apart.
 */
export function SidebarSections({
  pathname,
  onNavigate,
}: {
  pathname: string | null;
  onNavigate?: () => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {sellerNavigation.map((section, index) => (
        <li
          key={section.title}
          className={cn(index > 0 && "mt-4 border-t border-white/10 pt-5")}
        >
          <p className="px-3 pb-2 type-meta font-medium text-chrome-foreground/50">
            {section.title}
          </p>
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => (
              <NavRow
                key={item.href}
                href={item.href as Route}
                icon={item.icon}
                label={item.label}
                isActive={isSellerItemActive(pathname, item.href)}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

const NavRow = ({
  href,
  icon,
  label,
  isActive,
  onNavigate,
}: {
  href: Route;
  icon: React.ComponentProps<typeof SellerIcon>["name"];
  label: string;
  isActive: boolean;
  onNavigate?: () => void;
}) => {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "relative flex h-10 items-center gap-3 rounded-control pl-4 pr-3 text-[14px] leading-5 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome",
          isActive
            ? // Paper index tab pressed into the dark spine.
              "bg-paper font-semibold text-foreground"
            : "text-chrome-foreground/85 hover:bg-chrome-hover hover:text-chrome-foreground",
        )}
      >
        {isActive ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-[3px] rounded-l-control bg-primary"
          />
        ) : null}
        <SellerIcon
          name={icon}
          className={cn(
            isActive ? "text-primary" : "text-chrome-foreground/60",
            "transition-colors",
          )}
        />
        <span>{label}</span>
      </Link>
    </li>
  );
};
