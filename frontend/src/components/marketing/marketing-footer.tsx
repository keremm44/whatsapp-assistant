import Link from "next/link";

import { BrandMark } from "@/components/shared/brand-mark";

/**
 * Public site footer — a short, honest close. No invented legal links,
 * no support phone number that does not exist. It restates the real
 * account model and points at the two real destinations.
 */
export function MarketingFooter() {
  return (
    <footer className="border-t border-divider bg-chrome">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
        <div className="space-y-3">
          <BrandMark subtitle="Sakin Ustalık" />
          <p className="max-w-md type-body text-muted">
            Tekrar eden WhatsApp işlerini toplayan, bilmediğinde uydurmayan
            ve karar gerektiğinde satıcıya bırakan kontrollü asistan.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <Link
            href="/giris"
            className="w-fit rounded-control text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Satıcı girişi
          </Link>
          <a
            href="#basvur"
            className="w-fit rounded-control text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Başvuru yap
          </a>
        </div>
      </div>
    </footer>
  );
}
