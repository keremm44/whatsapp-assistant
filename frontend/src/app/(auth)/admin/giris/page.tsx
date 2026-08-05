import type { Metadata } from "next";
import { LoginForm } from "@/components/forms/login-form";

export const metadata: Metadata = {
  title: "Admin Girişi",
  description: "Yetkili yönetim girişi.",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLoginPage() {
  return (
    <section className="w-full max-w-sm border border-[#d6d7d4] bg-[#fafafa] p-6 shadow-sm sm:p-8">
      <p className="text-xs font-bold tracking-[.14em] text-[#666] uppercase">
        Yetkili alanı
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-[#222]">Admin Girişi</h1>
      <p className="mt-2 text-sm leading-6 text-[#666]">
        Yalnızca yetkilendirilmiş yönetici hesapları içindir.
      </p>
      <div className="mt-7">
        <LoginForm admin />
      </div>
    </section>
  );
}
