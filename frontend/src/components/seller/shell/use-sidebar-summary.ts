"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { fetchSellerSidebarSummary } from "@/lib/seller/sidebar-summary-api";
import type { SellerSidebarSummary } from "@/lib/seller/sidebar-summary";
import { getBrowserAccessToken } from "@/lib/supabase/client";

let cachedSummary: SellerSidebarSummary | null = null;
let cachedAt = 0;
let inFlight: Promise<SellerSidebarSummary | null> | null = null;
const CACHE_MS = 5_000;

const loadSummary = async (): Promise<SellerSidebarSummary | null> => {
  if (cachedSummary && Date.now() - cachedAt < CACHE_MS) return cachedSummary;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const accessToken = await getBrowserAccessToken();
    if (!accessToken) return null;
    try {
      const next = await fetchSellerSidebarSummary(accessToken);
      cachedSummary = next;
      cachedAt = Date.now();
      return next;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

export const useSellerSidebarSummary = (): SellerSidebarSummary | null => {
  const pathname = usePathname();
  const [summary, setSummary] = React.useState<SellerSidebarSummary | null>(
    cachedSummary,
  );

  React.useEffect(() => {
    let active = true;
    void loadSummary().then((next) => {
      if (active) setSummary(next);
    });
    return () => {
      active = false;
    };
  }, [pathname]);

  return summary;
};
