import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/forms/login-form";

export const metadata: Metadata = {
  title: "Giriş Yap",
  description: "Giriş bilgileri oluşturulmuş mağazalar için satıcı girişi.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <section className="w-full max-w-md rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6 shadow-[0_18px_50px_rgba(62,53,40,.08)] sm:p-8">
      <h1 className="font-serif text-3xl font-semibold">Mağaza girişi</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        Bu alan, giriş bilgileri tarafımızdan oluşturulmuş mağazalar içindir.
      </p>
      <div className="mt-7">
        <LoginForm />
      </div>
      <p className="mt-6 border-t border-[var(--line)] pt-5 text-sm leading-6 text-[var(--muted)]">
        Henüz giriş bilginiz yoksa mağazanız için{" "}
        <Link
          href="/hemen-basla"
          className="font-semibold text-[var(--green)] underline underline-offset-4"
        >
          Hemen Başla
        </Link>{" "}
        formunu kullanabilirsiniz.
      </p>
    </section>
  );
}
