"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { sellerNavigation } from "@/config/navigation";
import { isSellerItemActive } from "@/lib/routes/active-route";
import {
  countForSellerHref,
  formatSidebarCount,
} from "@/lib/seller/sidebar-summary";
import { cn } from "@/lib/utils/cn";

import { SellerIcon } from "./icon-map";
import { useSellerSidebarSummary } from "./sidebar-summary-provider";

export function SellerSidebar() {
  const pathname = usePathname();
  const workSections = sellerNavigation.slice(0, -1);
  const systemSection = sellerNavigation[sellerNavigation.length - 1];

  return (
    <aside aria-label="Satıcı paneli gezinme menüsü" className="hidden h-screen w-[232px] shrink-0 flex-col border-r border-boundary/70 bg-chrome text-chrome-foreground motion-safe:animate-fade-in lg:sticky lg:top-0 lg:flex">
      <BrandPlate />
      <nav aria-label="Çalışma alanları" className="scrollbar-quiet flex-1 overflow-y-auto px-3 py-4">
        <SectionList sections={workSections} pathname={pathname} />
      </nav>
      {systemSection ? (
        <div className="border-t border-boundary/40 px-3 py-3">
          <SectionList sections={[systemSection]} pathname={pathname} flush />
        </div>
      ) : null}
    </aside>
  );
}

const BrandPlate = () => (
  <div className="border-b border-boundary/40 px-4 pb-4 pt-5">
    <Link href="/seller" className="group flex items-center gap-2.5 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome">
      <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-brand/40 bg-brand/15 text-brand transition-[transform,border-color,background-color] duration-200 ease-out group-hover:scale-105 group-hover:border-brand/60 group-hover:bg-brand/20 motion-reduce:transform-none">
        <SellerIcon name="Store" size={16} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-[14px] font-semibold leading-tight tracking-[-0.012em] text-chrome-foreground">WhatsApp Asistan</span>
        <span className="mt-0.5 block type-meta text-chrome-foreground/45">Mağaza yönetimi</span>
      </span>
    </Link>
  </div>
);

export function SidebarSections({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return <SectionList sections={sellerNavigation} pathname={pathname} onNavigate={onNavigate} />;
}

function SectionList({ sections, pathname, onNavigate, flush = false }: { sections: typeof sellerNavigation; pathname: string | null; onNavigate?: () => void; flush?: boolean }) {
  const { summary } = useSellerSidebarSummary();
  return (
    <ul className="flex flex-col gap-1">
      {sections.map((section, index) => (
        <li key={section.title} className={cn(!flush && index > 0 && "mt-5 border-t border-boundary/30 pt-5")}>
          <SectionLabel title={section.title} />
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <NavRow key={item.href} href={item.href as Route} icon={item.icon} label={item.label} isActive={isSellerItemActive(pathname, item.href)} badgeCount={countForSellerHref(summary, item.href)} onNavigate={onNavigate} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

const SectionLabel = ({ title }: { title: string }) => (
  <p className="mb-1.5 flex items-center gap-2 px-3">
    <span aria-hidden="true" className="h-px w-2.5 shrink-0 bg-chrome-foreground/25" />
    <span className="type-eyebrow text-chrome-foreground/40">{title}</span>
  </p>
);

const NavRow = ({ href, icon, label, isActive, badgeCount, onNavigate }: { href: Route; icon: React.ComponentProps<typeof SellerIcon>["name"]; label: string; isActive: boolean; badgeCount: number | null; onNavigate?: () => void }) => (
  <li>
    <Link href={href} onClick={onNavigate} aria-current={isActive ? "page" : undefined} className={cn("group relative flex h-10 items-center gap-2.5 rounded-control pl-3 pr-3 text-[14px] leading-5", "transition-[background-color,color] duration-200 ease-out", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome", isActive ? "bg-raised font-semibold text-foreground" : "text-chrome-foreground/70 hover:bg-chrome-hover hover:text-chrome-foreground")}>
      {isActive ? <span aria-hidden="true" className="absolute inset-y-1 left-0 w-[3px] rounded-l-control bg-primary motion-safe:animate-fade-in" /> : null}
      <span className="flex w-5 shrink-0 justify-center">
        <SellerIcon name={icon} size={18} className={cn(isActive ? "text-primary" : "text-chrome-foreground/55", "transition-colors duration-200 ease-out group-hover:text-chrome-foreground")} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badgeCount !== null && badgeCount > 0 ? (
        <span aria-label={`${badgeCount} açık iş`} className="min-w-5 rounded-full bg-accent-muted px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums text-accent-text">
          {formatSidebarCount(badgeCount)}
        </span>
      ) : null}
    </Link>
  </li>
);
