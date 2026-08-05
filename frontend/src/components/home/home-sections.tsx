import { Check, Hand, PackageCheck, Pause, Truck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";

const questions = [
  "Fiyat nedir?",
  "Kaç günde hazırlanır?",
  "Fotoğraf nasıl gönderilir?",
  "İsim yazılıyor mu?",
  "Kargo ne zaman çıkar?",
];
const help = [
  "Ürün ve baskı seçenekleri",
  "Hazırlık ve kargo bilgileri",
  "Sipariş için gerekli bilgiler",
  "Yanıtlanamayan soruların size bırakılması",
];
const businesses = [
  "Kişiye özel kupa",
  "Baskılı tekstil",
  "Hediyelik ürün",
  "Fotoğraflı ürün",
  "Küçük üretim atölyeleri",
  "Mesajla sipariş alan mağazalar",
];

export function MessageLoadSection() {
  return (
    <section
      id="ozellikler"
      className="border-y border-[var(--line)] bg-[var(--paper)] py-18 sm:py-24"
    >
      <Container>
        <div className="grid items-start gap-12 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <SectionHeading
              eyebrow="Gün içinde"
              title="Aynı sorular, işinizin en yoğun anında tekrar gelir."
              description="Sipariş hazırlarken, baskı yaparken ya da kargoyla ilgilenirken mesajlar birikir. Asistan, mağazanızın bildiği net konularda yükü paylaşır."
            />
            <div className="mt-8 flex flex-wrap gap-2">
              {questions.map((question, index) => (
                <span
                  key={question}
                  className={`rounded-full border px-4 py-2 text-sm ${index === 2 ? "border-[var(--coral)] bg-[#fff3ed]" : "border-[var(--line)] bg-[var(--cream)]"}`}
                >
                  {question}
                </span>
              ))}
            </div>
          </div>
          <div className="lg:mt-14">
            <p className="mb-4 text-sm font-bold text-[var(--green)]">
              Asistanın yardımcı olduğu alanlar
            </p>
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {help.map((item, index) => (
                <div
                  key={item}
                  className="flex gap-3 border-t border-[var(--line)] pt-4"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--sage)] text-[var(--green)]">
                    {index === 1 ? (
                      <Truck aria-hidden size={15} />
                    ) : index === 2 ? (
                      <PackageCheck aria-hidden size={15} />
                    ) : (
                      <Check aria-hidden size={15} />
                    )}
                  </span>
                  <p className="text-sm leading-6">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

export function ControlSection() {
  return (
    <section className="py-18 sm:py-24">
      <Container>
        <div className="grid overflow-hidden rounded-[1.25rem] bg-[var(--green-dark)] text-white lg:grid-cols-[1.05fr_.95fr]">
          <div className="p-7 sm:p-12">
            <p className="mb-3 text-xs font-bold tracking-[.16em] text-[#bcd5c5] uppercase">
              Kontrol sizde
            </p>
            <h2 className="font-serif text-3xl leading-tight font-semibold sm:text-4xl">
              Asistan yardımcı olur.
              <br />
              Kararı siz verirsiniz.
            </h2>
            <p className="mt-5 max-w-xl leading-7 text-[#e0e9e3]">
              Konuşmayı dilediğiniz zaman devralabilir veya asistanı
              durdurabilirsiniz. İade, değişim ve ücret iadesi gibi önemli
              konularda sistem tek başına karar vermez.
            </p>
          </div>
          <div className="m-3 rounded-xl bg-[#f2eee4] p-6 text-[var(--ink)] sm:m-5 sm:p-8">
            <ul className="space-y-5">
              {[
                "İstediğiniz zaman durdurun",
                "Konuşmayı tek adımda devralın",
                "Mağaza kurallarınızı temel alın",
                "Belirsiz konuları kendinize bırakın",
              ].map((item, index) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-white text-[var(--green)]">
                    {index === 0 ? (
                      <Pause aria-hidden size={14} />
                    ) : index === 1 ? (
                      <Hand aria-hidden size={14} />
                    ) : (
                      <Check aria-hidden size={14} />
                    )}
                  </span>
                  <span className="leading-7 font-medium">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}

export function ProcessSection() {
  const steps = [
    "Mağazanızı ve ürünlerinizi anlatırsınız.",
    "Asistan mağazanızın bilgilerine göre hazırlanır.",
    "WhatsApp bağlantısı birlikte test edilir.",
    "Kontrol sizde olacak şekilde kullanıma açılır.",
  ];
  return (
    <section className="bg-[var(--sage)]/65 py-18 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="Birlikte kurulum"
          title="Hazır bir kalıp değil, mağazanıza göre bir hazırlık."
          description="Ne sattığınızı, hangi bilgileri verdiğinizi ve hangi konuları kendinize bırakmak istediğinizi birlikte netleştiririz."
        />
        <ol className="mt-10 grid gap-0 md:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={step}
              className="relative border-l border-[var(--green)]/25 py-2 pl-6 md:border-t md:border-l-0 md:pt-7 md:pr-7 md:pb-0 md:pl-0"
            >
              <span className="absolute top-0 -left-3 grid size-6 place-items-center rounded-full bg-[var(--green)] text-xs font-bold text-white md:-top-3 md:left-0">
                {index + 1}
              </span>
              <p className="text-sm leading-6 font-semibold">{step}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export function BusinessesSection() {
  return (
    <section className="py-18 sm:py-24">
      <Container className="grid gap-9 lg:grid-cols-[.75fr_1.25fr]">
        <SectionHeading
          eyebrow="Kimler için uygun?"
          title="Mesajla sipariş alan küçük işletmeler için."
          description="Her işletmenin ihtiyacı aynı değildir. En çok, ürününü anlatmak ve sipariş bilgisini toplamak için yoğun WhatsApp kullanan mağazalara yardımcı olur."
        />
        <div className="grid content-start gap-3 sm:grid-cols-2">
          {businesses.map((item, index) => (
            <div
              key={item}
              className={`border-b border-[var(--line)] px-2 py-4 text-base font-semibold ${index === 0 ? "sm:translate-x-5" : ""}`}
            >
              {item}
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="pb-18 sm:pb-24">
      <Container>
        <div className="flex flex-col items-start justify-between gap-7 border-y border-[var(--line)] py-10 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-serif text-3xl font-semibold">
              Mağazanız için birlikte hazırlayalım.
            </h2>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Birkaç temel bilgi bırakın. Mağazanızı kısaca inceleyip size
              WhatsApp üzerinden mesaj gönderelim.
            </p>
          </div>
          <ButtonLink href="/hemen-basla" className="shrink-0">
            Hemen Başla
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
