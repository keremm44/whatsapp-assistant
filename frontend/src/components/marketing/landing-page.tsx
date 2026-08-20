import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Headphones,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { BrandMark } from "@/components/shared/brand-mark";
import { Button } from "@/components/ui/button";

const principles = [
  {
    number: "01",
    title: "Mesajlar amaçsız uzamaz",
    description:
      "Asistan, müşteriyi oyalayan kalabalık cevaplar yerine konuşmanın ihtiyacına odaklanır.",
    icon: Clock3,
  },
  {
    number: "02",
    title: "Emin olmadığı yerde durur",
    description:
      "Bilmediği bilgiyi uydurmak yerine konuyu görünür kılar; siz karar vereceğiniz yeri bilirsiniz.",
    icon: ShieldCheck,
  },
  {
    number: "03",
    title: "Mağazanızın yanında kalır",
    description:
      "İade, özel talep ve inceleme isteyen konuşmalar sizi dışarıda bırakmadan ayrı tutulur.",
    icon: Headphones,
  },
] as const;

export function LandingPage() {
  return (
    <main className="marketing-theme marketing-field min-h-screen overflow-hidden bg-canvas text-foreground">
      <div className="relative mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8">
        <header className="relative z-10 flex items-center justify-between border-b border-divider/80 py-5 sm:py-6">
          <BrandMark subtitle="Satıcılar için kontrollü müşteri iletişimi" />
          <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted hover:text-foreground">
            <Link href="/giris">Giriş yap</Link>
          </Button>
        </header>

        <section className="relative grid gap-12 pb-20 pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(460px,.95fr)] lg:items-center lg:gap-12 lg:pb-28 lg:pt-24">
          <div className="relative z-10 max-w-2xl">
            <p className="mb-6 flex items-center gap-2 border-l-2 border-primary pl-3 type-meta font-semibold text-primary">
              <Sparkles aria-hidden="true" size={14} />
              Müşteri iletişiminde sakin kontrol
            </p>
            <h1 className="font-display text-[42px] font-semibold leading-[1.06] tracking-[-0.04em] text-foreground sm:text-[58px] lg:text-[66px]">
              Müşterileriniz yanıt bulurken, karar sizde kalsın.
            </h1>
            <p className="mt-7 max-w-xl text-[17px] leading-7 text-muted sm:text-[19px] sm:leading-8">
              WhatsApp Asistan; mağazanızın bilgileriyle müşterileri karşılar,
              karar gerektiren konuları size ayırır ve hiçbir konuşmayı kontrolünüzün dışına çıkarmaz.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="group px-6">
                <Link href="/giris">
                  Panelinize girin
                  <ArrowRight aria-hidden="true" size={17} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <p className="px-1 type-row-secondary text-muted-foreground">
                Teknik ayrıntılarla değil, mağazanızın gerçek ihtiyaçlarıyla başlar.
              </p>
            </div>
          </div>

          <div className="relative z-10 lg:pl-4">
            <AssistantPreview />
          </div>
        </section>

        <section className="relative z-10 border-y border-divider/80 py-10 sm:py-12">
          <div className="grid gap-7 md:grid-cols-3 md:gap-0 md:divide-x md:divide-divider">
            {principles.map(({ number, title, description, icon: Icon }) => (
              <article key={number} className="group relative px-1 md:px-7 md:first:pl-0 md:last:pr-0">
                <span className="type-meta type-figure text-brand">{number}</span>
                <Icon aria-hidden="true" size={20} strokeWidth={1.7} className="mt-5 text-primary transition-transform duration-200 group-hover:-translate-y-0.5" />
                <h2 className="mt-4 type-record-identity text-foreground">{title}</h2>
                <p className="mt-2 max-w-sm type-body text-muted">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="relative z-10 grid gap-10 py-20 lg:grid-cols-[.88fr_1.12fr] lg:items-center lg:py-28">
          <div>
            <p className="type-eyebrow text-primary">Şeffaf çalışma alanı</p>
            <h2 className="mt-4 max-w-lg font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-foreground sm:text-[42px]">
              Bu bir kara kutu değil.
            </h2>
            <p className="mt-5 max-w-lg type-body text-muted sm:text-[17px] sm:leading-7">
              Asistanın nerede ilerlediğini, hangi müşterinin dikkat beklediğini ve hangi konunun sizin değerlendirmenize kaldığını tek bir çalışma alanında izlersiniz.
            </p>
            <ul className="mt-7 space-y-3.5">
              {[
                "İade ve özel değerlendirme isteyen konular ayrılır.",
                "Yanıtlanamayan sorular görünür kalır.",
                "Konuşmalarınız ve mağaza bağlamınız tek yerde toplanır.",
              ].map((item) => (
                <li key={item} className="flex gap-3 type-row-secondary text-muted">
                  <CheckCircle2 aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-success" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <PanelPreview />
        </section>

        <section className="relative z-10 grid gap-8 border-t border-divider/80 py-20 lg:grid-cols-2 lg:gap-16 lg:py-24">
          <article className="rounded-floating border border-boundary/70 bg-raised/80 p-6 shadow-surface sm:p-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-control border border-attention/35 bg-attention-soft text-attention">
              <CircleAlert aria-hidden="true" size={19} strokeWidth={1.8} />
            </div>
            <p className="mt-6 type-eyebrow text-attention">Belirsizliği saklamaz</p>
            <h2 className="mt-3 type-section text-foreground">Bilmediği soruyu size bırakır.</h2>
            <p className="mt-3 max-w-lg type-body text-muted">
              Müşteri için önemli bir bilgi eksikse, asistan bunu rastgele tamamlamaya çalışmaz. Konu görünür olur; siz onayladığınız bilgiyle mağazanızın yanıtlarını güçlendirirsiniz.
            </p>
          </article>
          <article className="rounded-floating border border-boundary/70 bg-overlay/75 p-6 shadow-surface sm:p-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-control border border-success/35 bg-success-muted text-success">
              <Headphones aria-hidden="true" size={19} strokeWidth={1.8} />
            </div>
            <p className="mt-6 type-eyebrow text-success">Süreçte yalnız değilsiniz</p>
            <h2 className="mt-3 type-section text-foreground">Kontrol, kurulum ve destek aynı çizgide.</h2>
            <p className="mt-3 max-w-lg type-body text-muted">
              Mağaza bilgilerinizi düzenleyerek başlayın, çalışma alanınızı kendi akışınıza göre kullanın ve ihtiyaç duyduğunuzda destek kanallarına erişin.
            </p>
          </article>
        </section>

        <section className="relative z-10 mb-8 overflow-hidden rounded-floating border border-boundary/70 bg-raised px-6 py-10 shadow-surface sm:px-10 sm:py-12 lg:mb-12 lg:flex lg:items-end lg:justify-between">
          <div className="marketing-cta-orbit" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <p className="type-eyebrow text-brand">Mağazanız için daha sakin bir başlangıç</p>
            <h2 className="mt-4 font-display text-[31px] font-semibold leading-[1.12] tracking-[-0.03em] text-foreground sm:text-[42px]">
              Müşteri iletişimini görünür, kontrollü ve daha güvenli hale getirin.
            </h2>
          </div>
          <Button asChild size="lg" className="relative mt-7 shrink-0 px-6 lg:mt-0">
            <Link href="/giris">Giriş yap <ArrowRight aria-hidden="true" size={17} /></Link>
          </Button>
        </section>
      </div>
    </main>
  );
}

function AssistantPreview() {
  return (
    <div className="marketing-preview relative overflow-hidden rounded-floating border border-boundary/80 bg-raised p-4 shadow-2 sm:p-5">
      <div className="flex items-center justify-between border-b border-divider pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-control border border-brand/35 bg-brand/15 text-brand">
            <MessageSquareText aria-hidden="true" size={18} strokeWidth={1.8} />
          </span>
          <div>
            <p className="type-row-primary text-foreground">Müşteri konuşması</p>
            <p className="type-meta text-muted-foreground">Mağaza bağlamıyla ilerliyor</p>
          </div>
        </div>
        <span className="type-meta text-success">Takipte</span>
      </div>
      <div className="space-y-4 py-5">
        <div className="max-w-[86%] rounded-sheet rounded-tl-control bg-sunken px-4 py-3 type-row-secondary text-muted">
          Merhaba, ürünün ölçüsü ve teslimat süresi hakkında bilgi alabilir miyim?
        </div>
        <div className="ml-auto max-w-[88%] rounded-sheet rounded-tr-control border border-primary/20 bg-primary/10 px-4 py-3 type-row-secondary text-foreground">
          Elbette. Ürün sayfasındaki ölçü seçeneklerini paylaşabilirim. Teslimatla ilgili özel bir durum varsa mağazaya ileteyim.
        </div>
        <div className="flex items-center gap-2 border-t border-divider pt-4 type-meta text-muted-foreground">
          <ShieldCheck aria-hidden="true" size={14} className="text-success" />
          Karar gerektiren bilgi, satıcının görünürlüğünde kalır.
        </div>
      </div>
    </div>
  );
}

function PanelPreview() {
  return (
    <div className="marketing-panel relative overflow-hidden rounded-floating border border-boundary/80 bg-sunken p-3 shadow-2 sm:p-5">
      <div className="flex min-h-[385px] gap-3">
        <aside className="hidden w-[108px] shrink-0 rounded-sheet border border-boundary/60 bg-chrome p-3 sm:block">
          <div className="h-6 w-6 rounded-control border border-brand/40 bg-brand/15" />
          <div className="mt-8 space-y-3">
            <div className="h-2 w-11 rounded-full bg-chrome-foreground/50" />
            <div className="h-8 rounded-control bg-raised" />
            <div className="h-2 w-14 rounded-full bg-chrome-foreground/30" />
            <div className="h-2 w-10 rounded-full bg-chrome-foreground/30" />
          </div>
        </aside>
        <div className="min-w-0 flex-1 rounded-sheet border border-boundary/70 bg-canvas p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4 border-b border-divider pb-5">
            <div>
              <p className="type-meta text-primary">KONTROL MERKEZİ</p>
              <p className="mt-2 type-section text-foreground">İncelemeniz gerekenler</p>
            </div>
            <span className="flex h-10 min-w-10 items-center justify-center rounded-control border border-attention/35 bg-attention-soft px-2 type-figure font-display text-[18px] font-semibold text-attention">2</span>
          </div>
          <div className="mt-5 space-y-3">
            <PreviewTask label="İade incelemesi" title="Özel değerlendirme bekleyen müşteri talebi" attention />
            <PreviewTask label="Sipariş incelemesi" title="Karar gerektiren sipariş notu" attention />
            <PreviewTask label="Yanıt bekleyen soru" title="Mağaza bilgisinde eksik kalan konu" />
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewTask({ label, title, attention = false }: { label: string; title: string; attention?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-sheet border border-boundary/60 bg-raised px-3 py-3 sm:px-4">
      <span className={`h-8 w-1 rounded-full ${attention ? "bg-attention" : "bg-primary"}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="type-meta text-muted-foreground">{label}</p>
        <p className="mt-1 truncate type-row-primary text-foreground">{title}</p>
      </div>
      <ArrowRight aria-hidden="true" size={16} className="shrink-0 text-muted-foreground" />
    </div>
  );
}
