"use client";

import * as React from "react";

import { SELLER_FRESHNESS_INTERVAL_MS } from "@/lib/seller/freshness";

/**
 * Conservative visible-tab freshness check.
 *
 *   - runs only while document.visibilityState === "visible"
 *   - one in-flight check at a time
 *   - aborted on unmount
 *   - network/check failure is silent and never replaces valid content
 *   - never signs the seller out
 *   - does not auto-refresh; the caller shows a calm affordance
 */
export function useSellerFreshness({
  enabled,
  intervalMs = SELLER_FRESHNESS_INTERVAL_MS,
  check,
}: {
  enabled: boolean;
  intervalMs?: number;
  check: (signal: AbortSignal) => Promise<boolean>;
}): { hasUpdate: boolean; clearUpdate: () => void } {
  const [hasUpdate, setHasUpdate] = React.useState(false);
  const hasUpdateRef = React.useRef(false);
  hasUpdateRef.current = hasUpdate;
  const inflightRef = React.useRef(false);
  const checkRef = React.useRef(check);
  checkRef.current = check;

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const tick = async () => {
      if (cancelled || inflightRef.current || hasUpdateRef.current) {
        return;
      }
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }
      inflightRef.current = true;
      try {
        const changed = await checkRef.current(controller.signal);
        if (!cancelled && changed) {
          setHasUpdate(true);
        }
      } catch {
        // Silent freshness failure. Valid current content stays put.
      } finally {
        inflightRef.current = false;
      }
    };

    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(id);
    };
  }, [enabled, intervalMs]);

  return {
    hasUpdate,
    clearUpdate: () => setHasUpdate(false),
  };
}
