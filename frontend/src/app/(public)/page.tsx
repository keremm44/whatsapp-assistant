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
 * Public site is one dark operations document, not a landing of cards.
 * Seller fear → day split → control → try → remaining work → start → close.
 */
export default function HomePage() {
  return (
    <article>
      <Hero />
      <CriticalStatesSection />
      <DailyLoadSection />
      <ControlSection />
      <DemoSection />
      <PanelSection />
      <OnboardingSection />
      <SupportSection />
    </article>
  );
}
