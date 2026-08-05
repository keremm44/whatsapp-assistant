import { ConversationCard } from "@/components/home/conversation-card";
import {
  BusinessesSection,
  ControlSection,
  FinalCta,
  MessageLoadSection,
  ProcessSection,
} from "@/components/home/home-sections";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function HomePage() {
  return (
    <>
      <section className="overflow-hidden py-14 sm:py-20 lg:py-24">
        <Container className="grid items-center gap-12 lg:grid-cols-[1.03fr_.97fr]">
          <div>
            <p className="mb-5 inline-flex rounded-full border border-[var(--line)] bg-[var(--paper)] px-3 py-1.5 text-xs font-semibold text-[var(--green)]">
              Küçük işletmelerin mesaj yüküne sakin bir destek
            </p>
            <h1 className="max-w-3xl font-serif text-4xl leading-[1.08] font-semibold text-balance sm:text-6xl">
              Mesajlar çoğalırken işiniz yarım kalmasın.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-pretty text-[var(--muted)]">
              Mağazanıza göre hazırlanan WhatsApp asistanı, müşterilerinizin sık
              sorulan sorularına yanıt verir. Gerektiğinde konuşmayı size
              bırakır.
            </p>
            <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row">
              <ButtonLink href="/hemen-basla">Hemen Başla</ButtonLink>
              <ButtonLink href="/nasil-calisir" variant="secondary">
                Nasıl Çalışır?
              </ButtonLink>
            </div>
            <p className="mt-5 text-sm text-[var(--muted)]">
              Kontrol her zaman sizde kalır.
            </p>
          </div>
          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute -inset-5 -rotate-2 rounded-[2rem] bg-[#e9deca]"
            />
            <div className="relative">
              <ConversationCard />
            </div>
          </div>
        </Container>
      </section>
      <MessageLoadSection />
      <ControlSection />
      <ProcessSection />
      <BusinessesSection />
      <FinalCta />
    </>
  );
}
