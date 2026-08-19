import { ControlSection } from "@/components/marketing/control-section";
import { DayContrast } from "@/components/marketing/day-contrast";
import { DemoSection } from "@/components/marketing/demo-section";
import { DifficultCases } from "@/components/marketing/difficult-cases";
import { Hero } from "@/components/marketing/hero";
import { OnboardingSection } from "@/components/marketing/onboarding-section";
import { PanelSection } from "@/components/marketing/panel-section";
import { SupportSection } from "@/components/marketing/support-section";

/**
 * Public marketing site — the seller's mental journey, in order:
 *
 *   1. Hero         — "Bu benim için olabilir." (pain, one proof)
 *   2. Day contrast — "İşimi gerçekten azaltır mı?"
 *   3. Control      — "Yanlış cevap verir mi? Kontrolsüz mü?"
 *   4. Demo         — "Nasıl konuştuğunu kendim göreyim."
 *   5. Difficult    — "İade / sorun / beklenmeyen durumda ne yapar?"
 *   6. Panel        — "Ne olduğunu görür müyüm, ne yapacağımı bilir miyim?"
 *   7. Onboarding   — "Kurması zor mu?"
 *   8. Support      — "Yalnız mı kalırım?"
 */
export default function HomePage() {
  return (
    <div className="bg-canvas">
      <Hero />
      <DayContrast />
      <ControlSection />
      <DemoSection />
      <DifficultCases />
      <PanelSection />
      <OnboardingSection />
      <SupportSection />
    </div>
  );
}
