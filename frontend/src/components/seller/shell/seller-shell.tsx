import * as React from "react";
import { CircleAlert } from "lucide-react";

import { PageContainer } from "@/components/shared/page-container";
import type { AssistantStatusNotice } from "@/lib/seller/assistant-status";

import { SellerMobileNav } from "./seller-mobile-nav";
import { SellerSidebar } from "./seller-sidebar";
import { SellerSidebarSummaryProvider } from "./sidebar-summary-provider";
import { SellerTopbar } from "./seller-topbar";

export function SellerShell({
  children,
  storeName,
  assistantNotice = null,
}: {
  children: React.ReactNode;
  storeName: string;
  assistantNotice?: AssistantStatusNotice | null;
}) {
  return (
    <SellerSidebarSummaryProvider>
      <div className="seller-theme min-h-screen bg-canvas text-foreground">
        <div className="flex">
          <SellerSidebar />
          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <SellerTopbar storeName={storeName} />
            <main className="flex-1 pb-20 md:pb-10">
              {assistantNotice !== null ? (
                <PageContainer size="wide" className="pt-4">
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
      </div>
    </SellerSidebarSummaryProvider>
  );
}