import type { Metadata } from "next";

import { ControlSection } from "@/components/marketing/control-section";
import { CriticalStatesSection } from "@/components/marketing/critical-states-section";
import { DailyLoadSection } from "@/components/marketing/daily-load-section";
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
 * Seller-first psychological order (not a feature tour):
 *
 *   Hero      — what this is, one known conversation
 *   Critical  — will it hurt me? unknown / return / stop
 *   Daily     — a morning split into routine vs decision
 *   Control   — I can take over and give it back
 *   Demo      — try the behaviour
 *   Panel     — what remains as work
 *   Onboarding/support — start lightly, you are not alone
 */
export default function HomePage() {
  return (
    <div className="bg-canvas">
      <Hero />
      <CriticalStatesSection />
      <DailyLoadSection />
      <ControlSection />
      <DemoSection />
      <PanelSection />
      <OnboardingSection />
      <SupportSection />
    </div>
  );
}
