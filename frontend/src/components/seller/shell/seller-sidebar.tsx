"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { sellerNavigation } from "@/config/navigation";
import { isSellerItemActive } from "@/lib/routes/active-route";
import { cn } from "@/lib/utils/cn";

import { SellerIcon } from "./icon-map";

/** Desktop navigation spine — compact, authored and gently kinetic. */
export function SellerSidebar() {
  const pathname = usePathname();
  const workSections = sellerNavigation.slice(0, -1);
  const systemSection = sellerNavigation[sellerNavigation.length - 1];

  return (
    <aside
      aria-label="Satıcı paneli gezinme menüsü"
      className="hidden h-screen w-[232px] shrink-0 flex-col border-r border-boundary/70 bg-chrome text-chrome-foreground motion-safe:animate-fade-in lg:sticky lg:top-0 lg:flex"
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

const BrandPlate = () => (
  <div className="border-b border-boundary/40 px-4 pb-4 pt-5">
    <Link
      href="/seller"
      className="group flex items-center gap-2.5 rounded-control transition-transform duration-200 ease-out hover:translate-x-0.5 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
    >
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-brand/40 bg-brand/15 text-brand transition-[transform,border-color,background-color] duration-200 ease-out group-hover:-rotate-3 group-hover:scale-105 group-hover:border-brand/60 group-hover:bg-brand/20 motion-reduce:transform-none"
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

const SectionLabel = ({ title }: { title: string }) => (
  <p className="mb-1.5 flex items-center gap-2 px-3">
    <span
      aria-hidden="true"
      className="h-px w-2.5 shrink-0 bg-chrome-foreground/25 transition-all duration-200"
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
          "group relative flex h-10 items-center gap-2.5 rounded-control pl-3 pr-3 text-[14px] leading-5",
          "transition-[background-color,color,transform] duration-200 ease-out hover:translate-x-0.5 motion-reduce:transform-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-chrome",
          isActive
            ? "bg-raised font-semibold text-foreground"
            : "text-chrome-foreground/70 hover:bg-chrome-hover hover:text-chrome-foreground",
        )}
      >
        {isActive ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-0 w-[3px] rounded-control bg-primary motion-safe:animate-fade-in"
          />
        ) : null}
        <span className="flex w-5 shrink-0 justify-center">
          <SellerIcon
            name={icon}
            size={18}
            className={cn(
              isActive ? "text-primary" : "text-chrome-foreground/55",
              "transition-[color,transform] duration-200 ease-out group-hover:scale-105 group-hover:text-chrome-foreground motion-reduce:transform-none",
            )}
          />
        </span>
        <span className="min-w-0 truncate">{label}</span>
      </Link>
    </li>
  );
};
