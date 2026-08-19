import Link from "next/link";

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
    <header className="sticky top-0 z-50 border-b border-boundary/40 bg-chrome">
      <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between gap-3 px-4 md:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="WhatsApp Asistan ana sayfa"
          className="rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <BrandMark subtitle="Sakin Ustalık" />
        </Link>
        <nav aria-label="Üst menü" className="flex items-center gap-1 sm:gap-2">
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
