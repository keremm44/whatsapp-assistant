import Link from "next/link";

import { BrandMark } from "@/components/shared/brand-mark";

/**
 * Public site header — quiet, persistent chrome on the light canvas.
 *
 * Only the two real destinations exist here: the seller login and the
 * application form anchor. No invented signup/trial route. The header
 * stays server-rendered because there is no menu state to manage at
 * these breakpoints.
 */
export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-divider bg-chrome/90 backdrop-blur-sm">
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
            className="rounded-control px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-recessed hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Giriş yapın
          </Link>
          <a
            href="#basvur"
            className="rounded-control bg-primary-button px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Başvuru yap
          </a>
        </nav>
      </div>
    </header>
  );
}
