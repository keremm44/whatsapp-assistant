import * as React from "react";

import { SellerMobileNav } from "./seller-mobile-nav";
import { SellerSidebar } from "./seller-sidebar";
import { SellerTopbar } from "./seller-topbar";

/**
 * Macro shell for the seller application.
 *
 * - Desktop (>= 1024px): 240px sidebar on the left, fixed 64px topbar,
 *   content scrolls below the topbar.
 * - Tablet (768-1023px): no sidebar; the topbar exposes a menu trigger
 *   that opens the same navigation in a Sheet.
 * - Mobile (< 768px): topbar + content + fixed bottom navigation. The
 *   bottom nav exposes the four primary destinations.
 *
 * The `storeName` prop is the only display data the shell owns. The
 * layout is responsible for resolving the seller bootstrap; the
 * shell itself never reaches for `/seller/me` or any other
 * business API. The component is otherwise unchanged from the
 * approved macro shell.
 *
 * Theme:
 *   The root <div> carries the `seller-theme` class. The
 *   `.seller-theme` selector in `src/app/globals.css` overrides
 *   the canonical light-palette CSS variables so every Tailwind
 *   utility inside the seller workspace (e.g. `bg-primary`,
 *   `text-foreground`, `border-border`, `bg-surface`) resolves
 *   to a dark-warm value. Admin, auth, and public surfaces are
 *   outside this wrapper and stay on the light theme.
 */
export function SellerShell({
  children,
  storeName,
}: {
  children: React.ReactNode;
  storeName: string;
}) {
  return (
    <div className="seller-theme min-h-screen bg-background text-foreground">
      <div className="flex">
        <SellerSidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <SellerTopbar storeName={storeName} />
          <main className="flex-1 pb-20 md:pb-10">{children}</main>
        </div>
      </div>
      <SellerMobileNav />
    </div>
  );
}
