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
 * Desktop navigation spine — "Instrument".
 *
 * The spine is the DEEPEST material in the workspace (#0B0E13): the
 * frame the instrument is mounted in. Because the whole product is
 * now dark, the spine can no longer be "the dark thing" — it earns
 * its separation by sitting one full step below the canvas and by
 * carrying a single structural edge.
 *
 *   - 232px wide (unchanged; this direction does not disturb the
 *     information architecture).
 *
 *   - Brand: the wordmark only. No decorative mark, no coloured
 *     appendage, no brand hairline. The only saturated things in the
 *     spine are the active-destination markers, so colour keeps
 *     meaning something.
 *
 *   - Section labels use the one codified uppercase role
 *     (`type-eyebrow`) — in a dim field the wide tracking genuinely
 *     separates groups rather than decorating them.
 *
 *   - ACTIVE DESTINATION inverts the light-theme "paper tab" idea:
 *     on dark material the active row is the one that EMITS light.
 *     It combines four cues, so it never depends on hue alone:
 *       1. a raised material step (the row lifts out of the spine)
 *       2. a 3px interaction-cyan edge on the leading side
 *       3. brighter, semibold ink + a cyan icon
 *       4. aria-current="page"
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
      className="hidden h-screen w-[232px] shrink-0 flex-col border-r border-boundary/70 bg-chrome text-chrome-foreground lg:sticky lg:top-0 lg:flex"
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
      <span className="block font-display text-[15px] font-semibold leading-tight tracking-[-0.012em] text-chrome-foreground">
        WhatsApp Asistan
      </span>
      <span className="mt-0.5 block type-meta text-chrome-foreground/50">
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
          className={cn(index > 0 && "mt-4 border-t border-white/[0.07] pt-5")}
        >
          <p className="px-3 pb-2 type-eyebrow text-chrome-foreground/40">
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
            ? // On dark material the active row EMITS: it lifts to the
              // raised step and its ink brightens to full strength.
              "bg-raised font-semibold text-foreground"
            : "text-chrome-foreground/70 hover:bg-chrome-hover hover:text-chrome-foreground",
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
            isActive ? "text-primary" : "text-chrome-foreground/45",
            "transition-colors",
          )}
        />
        <span>{label}</span>
      </Link>
    </li>
  );
};
