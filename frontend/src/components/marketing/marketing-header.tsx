import Link from "next/link";

import { MarketingDockNav } from "@/components/marketing/marketing-motion";
import { BrandMark } from "@/components/shared/brand-mark";

/**
 * Public site header — the marketing frame, on the Instrument chrome
 * material (the same navigation spine the seller sidebar uses). Iris
 * carries the identity mark; cyan stays reserved for interaction.
 *
 * The application flow is not wired yet, so "Başvuru yap" is rendered as
 * an accessible disabled control — visible, but never a fake link that
 * does nothing. It will be re-activated when the real flow lands.
 */
export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-boundary bg-chrome">
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
