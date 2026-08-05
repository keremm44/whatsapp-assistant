import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="grid min-h-screen place-items-center"
    >
      <Container className="text-center">
        <p className="font-serif text-7xl text-[var(--coral)]">404</p>
        <h1 className="mt-4 font-serif text-4xl font-semibold">
          Aradığınız sayfayı bulamadık.
        </h1>
        <p className="mx-auto mt-4 max-w-lg leading-7 text-[var(--muted)]">
          Bağlantı değişmiş veya sayfa henüz hazırlanmamış olabilir.
        </p>
        <ButtonLink href="/" className="mt-7">
          Ana sayfaya dön
        </ButtonLink>
      </Container>
    </main>
  );
}
