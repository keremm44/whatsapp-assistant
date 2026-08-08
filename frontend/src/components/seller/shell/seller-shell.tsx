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
 */
export function SellerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <SellerSidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <SellerTopbar />
          <main className="flex-1 pb-20 md:pb-10">{children}</main>
        </div>
      </div>
      <SellerMobileNav />
    </div>
  );
}
