export function SupportSection() {
  return (
    <section className="bg-sunken">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-16 md:px-6 md:py-20 lg:px-8">
        <p className="type-eyebrow text-muted-foreground">Sonuç</p>
        <h2 className="mt-4 max-w-[900px] font-display text-[40px] font-semibold leading-[46px] tracking-[-0.028em] text-foreground sm:text-[56px] sm:leading-[62px]">
          Rutin konuşmalar asistanda. Karar gerekenler sizde.
        </h2>
        <p className="mt-5 max-w-xl text-base leading-7 text-muted">
          WhatsApp işinizi böyle bölüştürün; önce nasıl konuştuğunu ve ne zaman sizi
          devreye aldığını kendiniz görün.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a
            href="#dene"
            className="inline-flex min-h-11 items-center rounded-control bg-primary-button px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sunken"
          >
            Konuşmasını deneyin
          </a>
          <a
            href="#panel"
            className="inline-flex min-h-11 items-center px-1 py-3 text-base font-medium text-foreground underline decoration-divider underline-offset-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Bugün bakmanız gerekenleri görün
          </a>
        </div>
      </div>
    </section>
  );
}
