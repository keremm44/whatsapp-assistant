export function SupportSection() {
  return (
    <section className="bg-canvas">
      <div className="mx-auto w-full max-w-[720px] px-5 py-16 md:py-24">
        <h2 className="font-display text-[32px] font-semibold leading-[38px] tracking-[-0.028em] text-foreground sm:text-[40px] sm:leading-[46px]">
          Rutin konuşmalar asistanda. Karar gerekenler sizde.
        </h2>
        <p className="mt-5 max-w-xl text-[16px] leading-7 text-muted">
          Takıldığınızda aynı çalışma yüzeyinden yazarsınız. Yalnız
          bırakılmazsınız.
        </p>

        <div className="mt-8">
          <a
            href="#dene"
            className="inline-flex min-h-11 items-center rounded-control bg-primary-button px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Konuşmasını deneyin
          </a>
        </div>
      </div>
    </section>
  );
}
