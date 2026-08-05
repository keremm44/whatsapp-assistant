import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";
import { Container } from "@/components/ui/container";
import { brand } from "@/config/brand";

const links = [
  { href: "/nasil-calisir", label: "Nasıl Çalışır" },
  { href: "/hemen-basla", label: "Hemen Başla" },
  { href: "/giris", label: "Giriş Yap" },
  { href: "/iletisim", label: "İletişim" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--line)] bg-[var(--paper)]">
      <Container className="grid gap-9 py-10 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="max-w-md">
          <BrandMark />
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            {brand.brandDescription}
          </p>
        </div>
        <nav
          aria-label="Alt navigasyon"
          className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm"
        >
          {links.map((link) => (
            <Link
              className="hover:text-[var(--green)]"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-[var(--muted)] sm:col-span-2">
          © {new Date().getFullYear()} {brand.brandName}
        </p>
      </Container>
    </footer>
  );
}
