import { BrandMark } from "@/components/brand/brand-mark";
import { Container } from "@/components/ui/container";
import { DesktopNavigation } from "./desktop-navigation";
import { MobileMenu } from "./mobile-menu";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)]/80 bg-[var(--cream)]/95 backdrop-blur-sm">
      <Container className="relative flex h-17 items-center justify-between gap-5">
        <BrandMark />
        <DesktopNavigation />
        <MobileMenu />
      </Container>
    </header>
  );
}
