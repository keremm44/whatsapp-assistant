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
    <div className="marketing-theme flex min-h-screen flex-col bg-canvas text-foreground">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
