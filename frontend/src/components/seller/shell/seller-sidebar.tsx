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
 * The spine is the DEEPEST material in the workspace (#06090D): the
 * frame the instrument is mounted in.
 *
 * This pass makes the spine feel AUTHORED rather than generic, without
 * turning it into a branding billboard. Five deliberate moves:
 *
 *   1. BRAND PLATE. The wordmark now sits on a small monogram tile
 *      built from the workspace's own materials (raised tile, cyan
 *      glyph). It is a mark, not a logo lockup — one 28px tile, no
 *      colour field, no tagline styling beyond the existing eyebrow.
 *
 *   2. VERTICAL RHYTHM. The spine is a three-part column: brand plate
 *      (fixed) → scrollable work sections (flex-1) → pinned system
 *      area at the bottom. Previously every section, including
 *      "Sistem", was one undifferentiated scrolling list. Anchoring
 *      the system group gives the spine a top and a bottom.
 *
 *   3. SECTION BANDS. Group labels gain a short leading rule, so a
 *      section reads as a titled band instead of floating micro-text.
 *      Dividers move from white/[0.07] (effectively invisible on this
 *      material) to the real `boundary` token at low alpha.
 *
 *   4. ICON / LABEL RELATIONSHIP. Icons get their own fixed-width
 *      slot, so every label starts on the same x-axis and the column
 *      scans as one list. Resting icons brighten from /45 to /55 —
 *      discoverable without becoming a colourful icon set.
 *
 *   5. ACTIVE STATE keeps its four non-hue cues (raised material step,
 *      3px cyan leading edge, semibold brighter ink, cyan icon) and
 *      adds aria-current. No glow, no gradient.
 *
 * Colour discipline: the only saturated things in the spine are the
 * active-destination markers and the brand glyph. Nav items are NOT
 * colour-coded by content type.
 */
export function SellerSidebar() {
  const pathname = usePathname();

  // The last section ("Sistem") is pinned to the bottom of the spine
  // so the column has a real foot. Work sections scroll above it.
  const workSections = sellerNavigation.slice(0, -1);
  const systemSection = sellerNavigation[sellerNavigation.length - 1];

  return (
    <aside
      aria-label="Satıcı paneli gezinme menüsü"
      className="hidden h-screen w-[232px] shrink-0 flex-col border-r border-boundary/70 bg-chrome text-chrome-foreground lg:sticky lg:top-0 lg:flex"
    >
      <BrandPlate />

      <nav
        aria-label="Çalışma alanları"
        className="scrollbar-quiet flex-1 overflow-y-auto px-3 py-4"
      >
        <SectionList sections={workSections} pathname={pathname} />
      </nav>

      {systemSection ? (
        <div className="border-t border-boundary/40 px-3 py-3">
          <SectionList
            sections={[systemSection]}
            pathname={pathname}
            flush
          />
        </div>
      ) : null}
    </aside>
  );
}

/**
 * Product identity. A single monogram tile + wordmark.
 *
 * The tile uses the raised material with a cyan glyph — the same
 * material/interaction pair the active nav row uses, so the brand
 * reads as part of the instrument rather than as decoration bolted on
 * top. A boundary rule underneath separates identity from navigation.
 */
const BrandPlate = () => (
  <div className="border-b border-boundary/40 px-4 pb-4 pt-5">
    <Link
      href="/seller"
      className="group flex items-center gap-2.5 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
    >
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-boundary/60 bg-raised text-primary"
      >
        <SellerIcon name="Store" size={16} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-[14px] font-semibold leading-tight tracking-[-0.012em] text-chrome-foreground">
          WhatsApp Asistan
        </span>
        <span className="mt-0.5 block type-meta text-chrome-foreground/45">
          Mağaza yönetimi
        </span>
      </span>
    </Link>
  </div>
);

/**
 * The shared navigation body. Rendered in the desktop spine (split
 * into work + system groups) and in the tablet Sheet (as one list), so
 * the two can never drift apart.
 */
export function SidebarSections({
  pathname,
  onNavigate,
}: {
  pathname: string | null;
  onNavigate?: () => void;
}) {
  return (
    <SectionList
      sections={sellerNavigation}
      pathname={pathname}
      onNavigate={onNavigate}
    />
  );
}

function SectionList({
  sections,
  pathname,
  onNavigate,
  flush = false,
}: {
  sections: typeof sellerNavigation;
  pathname: string | null;
  onNavigate?: () => void;
  /** Pinned groups supply their own separation; skip the top rule. */
  flush?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {sections.map((section, index) => (
        <li
          key={section.title}
          className={cn(
            !flush && index > 0 && "mt-5 border-t border-boundary/30 pt-5",
          )}
        >
          <SectionLabel title={section.title} />
          <ul className="flex flex-col gap-0.5">
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

/**
 * Group label as a titled band: a short structural rule leads the
 * eyebrow so the group has a visible start, not just smaller text.
 * The rule is neutral — it marks structure, never state.
 */
const SectionLabel = ({ title }: { title: string }) => (
  <p className="mb-1.5 flex items-center gap-2 px-3">
    <span
      aria-hidden="true"
      className="h-px w-2.5 shrink-0 bg-chrome-foreground/25"
    />
    <span className="type-eyebrow text-chrome-foreground/40">{title}</span>
  </p>
);

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
          "relative flex h-10 items-center gap-2.5 rounded-control pl-3 pr-3 text-[14px] leading-5 transition-colors",
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
        {/* Fixed icon slot: every label starts on the same x-axis. */}
        <span className="flex w-5 shrink-0 justify-center">
          <SellerIcon
            name={icon}
            size={18}
            className={cn(
              isActive ? "text-primary" : "text-chrome-foreground/55",
              "transition-colors",
            )}
          />
        </span>
        <span className="min-w-0 truncate">{label}</span>
      </Link>
    </li>
  );
};
