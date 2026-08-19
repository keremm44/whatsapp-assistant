import type { Metadata } from "next";

import { ControlSection } from "@/components/marketing/control-section";
import { DayContrast } from "@/components/marketing/day-contrast";
import { DemoSection } from "@/components/marketing/demo-section";
import { Hero } from "@/components/marketing/hero";
import { OnboardingSection } from "@/components/marketing/onboarding-section";
import { PanelSection } from "@/components/marketing/panel-section";
import { SupportSection } from "@/components/marketing/support-section";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    url: "/",
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
  },
  twitter: {
    card: "summary",
    title: siteConfig.name,
    description: siteConfig.description,
  },
};

/**
 * Public marketing site — one objection per section:
 *
 *   1. Hero         — "Bu benim için olabilir." (promise + product face)
 *   2. Day contrast — "İşimi gerçekten azaltır mı?"
 *   3. Control      — "Kontrolsüz mü? Ne zaman durur?" (handoff + coral path)
 *   4. Demo         — "Nasıl konuştuğunu kendim göreyim."
 *   5. Panel        — "Durduğunda ben nerede görürüm?"
 *   6. Onboarding   — "Kurması zor mu?"
 *   7. Support      — "Yalnız kalır mıyım, şimdi ne yapmalıyım?"
 */
export default function HomePage() {
  return (
    <div className="bg-canvas">
      <Hero />
      <DayContrast />
      <ControlSection />
      <DemoSection />
      <PanelSection />
      <OnboardingSection />
      <SupportSection />
    </div>
  );
}
