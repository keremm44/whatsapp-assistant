"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { fetchSellerSidebarSummary } from "@/lib/seller/sidebar-summary-api";
import type { SellerSidebarSummary } from "@/lib/seller/sidebar-summary";
import { getBrowserAccessToken } from "@/lib/supabase/client";

type SidebarSummaryContextValue = {
  summary: SellerSidebarSummary | null;
};

const SidebarSummaryContext = React.createContext<SidebarSummaryContextValue>({
  summary: null,
});

export const SellerSidebarSummaryProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const pathname = usePathname();
  const [summary, setSummary] = React.useState<SellerSidebarSummary | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const load = async () => {
      const accessToken = await getBrowserAccessToken();
      if (!accessToken || !active) return;
      try {
        const next = await fetchSellerSidebarSummary(accessToken, controller.signal);
        if (active) setSummary(next);
      } catch {
        // Badge data is supplemental. A transient summary failure must not
        // blank navigation or invent zero counts.
        if (active) setSummary(null);
      }
    };

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [pathname]);

  return (
    <SidebarSummaryContext.Provider value={{ summary }}>
      {children}
    </SidebarSummaryContext.Provider>
  );
};

export const useSellerSidebarSummary = (): SidebarSummaryContextValue =>
  React.useContext(SidebarSummaryContext);
