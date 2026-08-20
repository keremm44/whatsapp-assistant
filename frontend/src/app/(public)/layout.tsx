import { FieldGrain } from "@/components/marketing/marketing-frame";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";

/**
 * Public marketing site layout.
 *
 * The wrapper carries the `marketing-theme` class: the same Instrument
 * material ladder, ink and signal roles the seller workspace uses,
 * scoped to the public subtree (`.seller-theme` keeps its own selector).
 * Admin and auth surfaces stay on the light root theme.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="marketing-theme relative flex min-h-screen flex-col bg-canvas text-foreground">
      <FieldGrain />
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-control bg-primary-button px-4 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:inline-flex focus:min-h-11 focus:items-center focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-canvas"
      >
        Ana içeriğe geç
      </a>
      <MarketingHeader />
      <main id="main-content" tabIndex={-1} className="relative z-10 flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
