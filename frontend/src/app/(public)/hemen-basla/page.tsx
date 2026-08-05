import type { Metadata } from "next";
import { ApplicationForm } from "@/components/forms/application-form";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Hemen Başla",
  description:
    "Mağazanız için birlikte hazırlamaya başlamak üzere kısa bilgilerinizi bırakın.",
};

export default function StartPage() {
  return (
    <section className="py-12 sm:py-18">
      <Container className="grid gap-10 lg:grid-cols-[.85fr_1.15fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-xs font-bold tracking-[.16em] text-[var(--green)] uppercase">
            İlk adım
          </p>
          <h1 className="mt-4 font-serif text-4xl leading-tight font-semibold text-balance sm:text-5xl">
            Mağazanız için birlikte hazırlayalım.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-[var(--muted)]">
            Birkaç temel bilgi bırakın. Mağazanızı kısaca inceleyip size
            WhatsApp üzerinden mesaj gönderelim.
          </p>
          <div className="mt-8 border-l-2 border-[var(--coral)] pl-4 text-sm leading-6 text-[var(--muted)]">
            İlk dönüşümüz WhatsApp mesajıyla olur.
          </div>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-5 shadow-[0_18px_50px_rgba(62,53,40,.08)] sm:p-8">
          <ApplicationForm />
        </div>
      </Container>
    </section>
  );
}
