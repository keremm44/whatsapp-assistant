import type { Metadata } from "next";
import { Mail, MessageCircle } from "lucide-react";
import { Container } from "@/components/ui/container";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "İletişim",
  description: "Sorunuzu yazın, size mesajla dönüş yapalım.",
};

export default function ContactPage() {
  return (
    <section className="py-14 sm:py-20">
      <Container>
        <div className="max-w-2xl">
          <p className="text-xs font-bold tracking-[.16em] text-[var(--green)] uppercase">
            İletişim
          </p>
          <h1 className="mt-4 font-serif text-4xl font-semibold sm:text-5xl">
            Sorunuzu yazın, size mesajla dönüş yapalım.
          </h1>
          <p className="mt-5 text-lg leading-8 text-[var(--muted)]">
            Kurulum süreci veya mağazanızın uygunluğu hakkında merak ettiğiniz
            konuları kısa bir mesajla paylaşabilirsiniz.
          </p>
        </div>
        <div className="mt-12 grid max-w-3xl gap-5 sm:grid-cols-2">
          <div className="border-t-2 border-[var(--green)] bg-[var(--paper)] p-6">
            <MessageCircle aria-hidden className="text-[var(--green)]" />
            <h2 className="mt-5 text-lg font-semibold">WhatsApp mesajı</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              İletişim numarası marka ayarları tamamlandığında burada yer
              alacak.
            </p>
          </div>
          <div className="border-t-2 border-[var(--coral)] bg-[var(--paper)] p-6">
            <Mail aria-hidden className="text-[var(--coral)]" />
            <h2 className="mt-5 text-lg font-semibold">E-posta</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {brand.contactNotice}
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
