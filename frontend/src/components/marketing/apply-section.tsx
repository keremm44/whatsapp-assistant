import Link from "next/link";

import { ApplicationForm } from "@/components/marketing/application-form";
import { MarketingSectionHeading } from "@/components/marketing/section-heading";

/**
 * Deneme / CTA — the close. The single real conversion path: a public
 * seller application (POST /applications). The existing-seller path is a
 * quiet link to /giris, matching the login form's own note.
 */
export function ApplySection() {
  return (
    <section id="basvur" className="mx-auto w-full max-w-[1180px] scroll-mt-16 px-4 py-16 md:px-6 md:py-20 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
        <div className="space-y-5">
          <MarketingSectionHeading
            eyebrow="Deneyin"
            title="Denemek istiyorsanız, sizi tanıyalım."
            description="Başvurunuzu alıp uygunluk görüşmesi için WhatsApp üzerinden sizinle iletişime geçiyoruz. Hesap, davet ile oluşturulur."
          />
          <ul className="space-y-2.5 pt-2">
            <ApplyNote>
              Başvuru ücretsizdir; uygunluk görüşmesi WhatsApp üzerinden yapılır.
            </ApplyNote>
            <ApplyNote>
              Asistan, işletmenizin bilgileriyle kurulur ve canlıya çıkmadan test edilir.
            </ApplyNote>
            <ApplyNote>
              Zaten hesabınız var mı?{" "}
              <Link
                href="/giris"
                className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Giriş yapın
              </Link>
            </ApplyNote>
          </ul>
        </div>

        <div className="rounded-sheet border border-boundary/60 bg-surface p-5 shadow-surface sm:p-6">
          <ApplicationForm />
        </div>
      </div>
    </section>
  );
}

function ApplyNote({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 type-body text-muted">
      <span
        aria-hidden="true"
        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70"
      />
      <span>{children}</span>
    </li>
  );
}
