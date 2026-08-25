import * as React from "react";
import { CircleAlert } from "lucide-react";

import { PageContainer } from "@/components/shared/page-container";
import { Toaster } from "@/components/ui/toaster";
import type { AssistantStatusNotice } from "@/lib/seller/assistant-status";

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
 *   the canonical palette CSS variables so every Tailwind utility
 *   inside the seller workspace resolves to an "Instrument" value:
 *   a cool blue-graphite material ladder, interaction cyan and
 *   coral seller attention. This describes the seller shell itself;
 *   it does not impose a light-theme requirement on public, auth or
 *   future product surfaces. Those surfaces may reuse or adapt the
 *   Instrument language when their own product direction calls for it.
 */
export function SellerShell({
  children,
  storeName,
  assistantNotice = null,
}: {
  children: React.ReactNode;
  storeName: string;
  /**
   * Global assistant status notice, computed by the layout from the
   * real /seller/me access block. Null in the normal operational
   * state — nothing is rendered then (no green badge, no decorative
   * health chrome). Non-null only for genuinely non-normal backend
   * states (ai disabled / onboarding incomplete / non-active
   * system_status), shown as a calm informational band above the
   * page content. No CTA: the backend exposes no seller-panel action
   * for these states.
   */
  assistantNotice?: AssistantStatusNotice | null;
}) {
  return (
    <div className="seller-theme min-h-screen bg-canvas text-foreground">
      <div className="flex">
        <SellerSidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <SellerTopbar storeName={storeName} />
          <main className="flex-1 pb-20 md:pb-10">
            {assistantNotice !== null ? (
              <PageContainer size="wide" className="pt-4">
                {/* The notice renders ONLY for a genuinely non-normal
                    backend assistant state (ai disabled / onboarding
                    incomplete / non-active system status). That is a
                    SYSTEM-degraded condition, not a per-record seller
                    review, so it uses the warning role. Keeping coral
                    exclusively for "a customer record needs you" stops
                    the two from blurring into one alarm colour. */}
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-sheet border-l-[3px] border-l-warning bg-warning-muted px-4 py-3"
                >
                  <CircleAlert
                    aria-hidden="true"
                    size={16}
                    strokeWidth={1.75}
                    className="mt-0.5 shrink-0 text-warning"
                  />
                  <div className="min-w-0 space-y-0.5">
                    <p className="type-row-primary text-foreground">
                      {assistantNotice.title}
                    </p>
                    <p className="type-row-secondary text-muted">
                      {assistantNotice.description}
                    </p>
                  </div>
                </div>
              </PageContainer>
            ) : null}
            {children}
          </main>
        </div>
      </div>
      <SellerMobileNav />
      <Toaster />
    </div>
  );
}