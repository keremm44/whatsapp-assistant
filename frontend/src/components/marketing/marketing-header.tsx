"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { MarketingDockNav } from "@/components/marketing/marketing-motion";
import { BrandMark } from "@/components/shared/brand-mark";
import { cn } from "@/lib/utils/cn";

const HEADER_OPEN_REGION = 72;
const HEADER_DIRECTION_THRESHOLD = 10;

/**
 * Public site header — the marketing frame on the Instrument chrome
 * material. It mirrors the seller topbar's proven scroll-direction
 * behaviour: down gets the rail out of the way, up brings it back.
 * Movement is transform-only and focus always reveals the header.
 *
 * The application flow is not wired yet, so "Başvuru yap" remains an
 * accessible disabled control until the real flow exists.
 */
export function MarketingHeader() {
  const pathname = usePathname();
  const [isHidden, setIsHidden] = React.useState(false);
  const lastScrollY = React.useRef(0);
  const directionAnchorY = React.useRef(0);
  const direction = React.useRef<"up" | "down" | null>(null);
  const ticking = React.useRef(false);
  const frame = React.useRef<number | null>(null);

  React.useEffect(() => {
    const readScrollY = () =>
      Math.max(window.scrollY || document.documentElement.scrollTop || 0, 0);

    const initialY = readScrollY();
    lastScrollY.current = initialY;
    directionAnchorY.current = initialY;
    direction.current = null;
    setIsHidden(false);

    const update = () => {
      const nextY = readScrollY();
      const previousY = lastScrollY.current;

      if (nextY < HEADER_OPEN_REGION) {
        setIsHidden(false);
        direction.current = null;
        directionAnchorY.current = nextY;
      } else if (nextY !== previousY) {
        const nextDirection = nextY > previousY ? "down" : "up";

        if (direction.current !== nextDirection) {
          direction.current = nextDirection;
          directionAnchorY.current = previousY;
        }

        if (Math.abs(nextY - directionAnchorY.current) >= HEADER_DIRECTION_THRESHOLD) {
          setIsHidden(nextDirection === "down");
        }
      }

      lastScrollY.current = nextY;
      ticking.current = false;
      frame.current = null;
    };

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      frame.current = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
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
      <div className="mx-auto grid h-14 w-full max-w-[1180px] grid-cols-[1fr_auto] items-center gap-3 px-4 md:px-6 lg:grid-cols-[1fr_auto_1fr] lg:px-8">
        <Link
          href="/"
          aria-label="WhatsApp Asistan ana sayfa"
          className="w-fit rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <BrandMark subtitle="Sakin Ustalık" />
        </Link>

        <MarketingDockNav />

        <nav aria-label="Hesap menüsü" className="flex items-center justify-end gap-1 sm:gap-2">
          <Link
            href="/giris"
            className="rounded-control px-3 py-2 text-sm font-medium text-chrome-foreground/70 transition-colors hover:bg-chrome-hover hover:text-chrome-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Giriş yapın
          </Link>
          <button
            type="button"
            disabled
            title="Başvuru akışı şimdilik kapalı"
            className="cursor-not-allowed rounded-control bg-primary-button px-4 py-2 text-sm font-medium text-primary-foreground opacity-55"
          >
            Başvuru yap
          </button>
        </nav>
      </div>
    </header>
  );
}
