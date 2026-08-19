"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  advanceMarketingHeaderScroll,
  createMarketingHeaderScrollState,
} from "@/components/marketing/marketing-header-scroll";
import { MarketingDockNav } from "@/components/marketing/marketing-motion";
import { BrandMark } from "@/components/shared/brand-mark";
import { cn } from "@/lib/utils/cn";

const ANCHOR_HIDE_SUPPRESSION_MS = 500;

/**
 * Public site header — the marketing frame on the Instrument chrome
 * material. It mirrors the seller topbar's proven scroll-direction
 * behaviour: down gets the rail out of the way, up brings it back.
 *
 * Public-only refinement: any real in-page anchor click briefly suppresses
 * downward hiding so the deliberate section jump does not immediately make
 * the navigation disappear. Movement is transform-only and focus always
 * reveals the header.
 */
export function MarketingHeader() {
  const pathname = usePathname();
  const [isHidden, setIsHidden] = React.useState(false);
  const scrollState = React.useRef(createMarketingHeaderScrollState());
  const suppressHideUntil = React.useRef(0);
  const ticking = React.useRef(false);
  const frame = React.useRef<number | null>(null);

  React.useEffect(() => {
    const readScrollY = () =>
      Math.max(window.scrollY || document.documentElement.scrollTop || 0, 0);

    const revealForAnchorJump = () => {
      suppressHideUntil.current = performance.now() + ANCHOR_HIDE_SUPPRESSION_MS;
      setIsHidden(false);
    };

    const onDocumentClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
      const href = anchor?.getAttribute("href");
      if (!href || href === "#") return;
      revealForAnchorJump();
    };

    scrollState.current = createMarketingHeaderScrollState(readScrollY());
    suppressHideUntil.current = 0;
    setIsHidden(false);

    const update = () => {
      const next = advanceMarketingHeaderScroll(
        scrollState.current,
        readScrollY(),
        {
          suppressDownwardHide: performance.now() < suppressHideUntil.current,
        },
      );

      scrollState.current = next;
      setIsHidden(next.hidden);
      ticking.current = false;
      frame.current = null;
    };

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      frame.current = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onDocumentClick);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onDocumentClick);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      frame.current = null;
      ticking.current = false;
    };
  }, [pathname]);

  return (
    <header
      onFocusCapture={() => setIsHidden(false)}
      className={cn(
        "sticky top-0 z-50 border-b border-boundary bg-chrome",
        "transition-[transform,opacity] duration-200 ease-out will-change-transform motion-reduce:transition-none",
        isHidden
          ? "pointer-events-none -translate-y-full opacity-0"
          : "translate-y-0 opacity-100",
      )}
    >
      <div className="mx-auto grid h-14 w-full max-w-[1180px] grid-cols-[1fr_auto] items-center gap-2 px-3 sm:gap-3 sm:px-4 md:px-6 lg:grid-cols-[1fr_auto_1fr] lg:px-8">
        <Link
          href="/"
          aria-label="WhatsApp Asistan ana sayfa"
          className="w-fit rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <BrandMark
            subtitle="Sakin Ustalık"
            className="[&>span:last-child]:hidden min-[375px]:[&>span:last-child]:block"
          />
        </Link>

        <MarketingDockNav />

        <nav aria-label="Hesap menüsü" className="flex items-center justify-end gap-1 sm:gap-2">
          <Link
            href="/giris"
            aria-label="Giriş yapın"
            className="rounded-control px-2.5 py-2 text-sm font-medium text-chrome-foreground/70 transition-colors hover:bg-chrome-hover hover:text-chrome-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-3"
          >
            <span className="sm:hidden">Giriş</span>
            <span className="hidden sm:inline">Giriş yapın</span>
          </Link>
          <span
            role="note"
            aria-label="Başvuru yap — satıcı hesapları şu anda davet ile oluşturulur"
            title="Başvuru akışı şimdilik kapalı; satıcı hesapları davet ile oluşturulur."
            className="inline-flex cursor-default items-center rounded-control border border-boundary bg-recessed px-2.5 py-2 text-sm font-medium text-muted-foreground sm:px-3"
          >
            Başvuru yap
          </span>
        </nav>
      </div>
    </header>
  );
}
