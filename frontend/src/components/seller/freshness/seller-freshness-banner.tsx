"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SELLER_FRESHNESS_COPY } from "@/lib/seller/freshness";

import { useSellerFreshness } from "./use-seller-freshness";

/**
 * Restrained inline freshness affordance. No toast, no fabricated
 * count, no claim about what changed. Clicking Yenile asks the
 * server page to re-resolve; local drafts/history are not touched
 * by the background check itself.
 */
export function SellerFreshnessBanner({
  visible,
  onRefresh,
  busy = false,
}: {
  visible: boolean;
  onRefresh: () => void;
  busy?: boolean;
}) {
  if (!visible) return null;
  return (
    <div
      role="status"
      // Neutral band: this spans the full width of a work region, so a
      // cyan wash here would read as a large tinted surface. Cyan stays
      // on the action only.
      className="flex items-center justify-between gap-3 border-b border-divider bg-overlay px-4 py-2 md:px-5"
    >
      <p className="type-row-secondary text-foreground">
        {SELLER_FRESHNESS_COPY.message}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        disabled={busy}
        aria-busy={busy}
        className="shrink-0 font-semibold text-primary"
      >
        {SELLER_FRESHNESS_COPY.action}
      </Button>
    </div>
  );
}

/**
 * Wires the visible-tab check to the existing router.refresh() path.
 * `check` must use current filters and treat any failure as "no change".
 */
export function SellerFreshnessNotice({
  enabled,
  check,
}: {
  enabled: boolean;
  check: (signal: AbortSignal) => Promise<boolean>;
}) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const { hasUpdate, clearUpdate } = useSellerFreshness({ enabled, check });

  React.useEffect(() => {
    if (!isPending) {
      setIsRefreshing(false);
    }
  }, [isPending]);

  const onRefresh = () => {
    if (isRefreshing || isPending) return;
    clearUpdate();
    setIsRefreshing(true);
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <SellerFreshnessBanner
      visible={hasUpdate}
      onRefresh={onRefresh}
      busy={isRefreshing || isPending}
    />
  );
}
