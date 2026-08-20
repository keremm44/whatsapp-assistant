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
 * Public composition uses the seller Instrument language at marketing scale:
 *
 *   Hero      — clear promise + one readable conversation close-up
 *   Daily     — narrow, quiet proof of what leaves the seller's attention
 *   Control   — medium-density real ownership interaction
 *   Demo      — first wide product moment
 *   Critical  — deliberate narrow focus on unknown/return boundaries
 *   Panel     — widest and most product-dense visual peak
 *   Onboarding/support/final — density falls again before the closing action
 */
export default function HomePage() {
  return (
    <div className="bg-canvas">
      <Hero />
      <DailyLoadSection />
      <ControlSection />
      <DemoSection />
      <CriticalStatesSection />
      <PanelSection />
      <OnboardingSection />
      <SupportSection />
    </div>
  );
}
