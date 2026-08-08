import Link from "next/link";

/**
 * Foundation landing page — minimal and restrained on purpose. The real
 * hero, pain mirror, and proof sections arrive in the marketing step.
 */
export default function HomePage() {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <p className="text-sm text-muted-foreground">Sakin Ustalık</p>
      <h1 className="font-heading text-3xl text-foreground sm:text-4xl">
        WhatsApp&apos;ta tekrar eden işleri asistanınız yönetsin.
      </h1>
      <p className="max-w-xl text-base text-muted-foreground">
        Bilmediğinde uydurmaz. Karar gerektiğinde sizi devreye alır. Kontrol
        her zaman sizde.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/giris"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Satıcı girişi
        </Link>
      </div>
    </section>
  );
}
