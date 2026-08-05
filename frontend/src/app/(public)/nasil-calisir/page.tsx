import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Nasıl Çalışır?",
  description:
    "Mağaza asistanının mağazanıza göre nasıl hazırlandığını adım adım öğrenin.",
};
const steps = [
  [
    "Kısa bilgilerinizi bırakırsınız",
    "Mağazanızı, ürünlerinizi ve en çok nerede desteğe ihtiyaç duyduğunuzu kısaca anlatırsınız.",
  ],
  [
    "Size mesajla dönüş yaparız",
    "Ekibimiz mağazanızı inceler ve WhatsApp üzerinden mesaj gönderir.",
  ],
  [
    "Giriş bilgileriniz hazırlanır",
    "Birlikte ilerlemeye karar verilirse giriş bilgileriniz tarafımızdan oluşturulur. Kendi kendine doğrudan kayıt yoktur.",
  ],
  [
    "Mağaza bilgilerinizi tanımlarsınız",
    "Ürünler, baskı seçenekleri, hazırlık süresi, kargo ve mağaza kuralları sisteme eklenir.",
  ],
  [
    "Bağlantıyı birlikte test ederiz",
    "WhatsApp bağlantısı ve gerçekçi soru örnekleri kontrollü biçimde denenir.",
  ],
  [
    "Kontrollü biçimde kullanıma açılır",
    "Asistan cevaplayabildiği konularda destek olur; belirsiz veya önemli konuları size bırakır.",
  ],
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="border-b border-[var(--line)] py-14 sm:py-20">
        <Container>
          <p className="text-xs font-bold tracking-[.16em] text-[var(--green)] uppercase">
            Nasıl çalışır?
          </p>
          <h1 className="mt-4 max-w-3xl font-serif text-4xl leading-tight font-semibold text-balance sm:text-5xl">
            Mağazanızı tanıyarak başlayan, birlikte ilerleyen bir kurulum.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted)]">
            Tek tip cevaplar yerine mağazanızın ürünleri ve kuralları temel
            alınır. İlk temastan kullanıma açılışa kadar süreç mesajla ve açık
            adımlarla ilerler.
          </p>
        </Container>
      </section>
      <section className="py-14 sm:py-20">
        <Container>
          <ol className="mx-auto max-w-4xl">
            {steps.map(([title, description], index) => (
              <li
                key={title}
                className="grid gap-4 border-b border-[var(--line)] py-7 sm:grid-cols-[5rem_1fr]"
              >
                <span className="font-serif text-3xl text-[var(--coral)]">
                  0{index + 1}
                </span>
                <div>
                  <h2 className="text-xl font-semibold">{title}</h2>
                  <p className="mt-2 max-w-2xl leading-7 text-[var(--muted)]">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mx-auto mt-12 flex max-w-4xl flex-col items-start gap-4 rounded-xl bg-[var(--sage)] p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl leading-7 font-medium">
              Kontrol sizde kalır. Asistanın cevaplayamadığı konuşmalar size
              bırakılır.
            </p>
            <ButtonLink href="/hemen-basla">Hemen Başla</ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}
