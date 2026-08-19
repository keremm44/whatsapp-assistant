import type { Metadata } from "next";

import { ControlSection } from "@/components/marketing/control-section";
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
 * Public marketing flow follows one conversation-ownership story rather than
 * presenting seven independent feature sections:
 *
 *   Hero / workday — value + daily attention split in one ledger
 *   Control        — ownership changes hands
 *   Demo           — seller tries the same behaviour
 *   Panel          — the same return record becomes real seller work
 *   Onboarding     — seller validates before going live
 *   Support/final  — ownership principle resolves into one closing action
 */
export default function HomePage() {
  return (
    <div className="bg-canvas">
      <Hero />
      <ControlSection />
      <DemoSection />
      <PanelSection />
      <OnboardingSection />
      <SupportSection />
    </div>
  );
}
