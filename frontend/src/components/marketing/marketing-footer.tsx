import Link from "next/link";

import { BrandMark } from "@/components/shared/brand-mark";

export function MarketingFooter() {
  return (
    <footer className="relative z-10 bg-canvas">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3">
          <BrandMark />
          <p className="max-w-md type-body text-muted">
            Tekrar eden WhatsApp işlerini karşılayan, bilmediğinde uydurmayan
            ve karar gerektiğinde satıcıya bırakan kontrollü asistan.
          </p>
        </div>
        <Link
          href="/giris"
          className="inline-flex min-h-11 w-fit items-center rounded-control text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Satıcı girişi
        </Link>
      </div>
    </footer>
  );
}
