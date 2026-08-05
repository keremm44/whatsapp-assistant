"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";

const links = [
  { href: "/nasil-calisir", label: "Nasıl Çalışır" },
  { href: "/#ozellikler", label: "Özellikler" },
  { href: "/iletisim", label: "İletişim" },
];

function isCurrentPage(pathname: string, href: string): boolean {
  return !href.includes("#") && pathname === href;
}

export function DesktopNavigation() {
  const pathname = usePathname();

  return (
    <>
      <nav
        aria-label="Ana navigasyon"
        className="hidden items-center gap-7 md:flex"
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={
              isCurrentPage(pathname, link.href) ? "page" : undefined
            }
            className="nav-link"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="hidden items-center gap-2 md:flex">
        <ButtonLink
          href="/giris"
          variant="quiet"
          aria-current={pathname === "/giris" ? "page" : undefined}
        >
          Giriş Yap
        </ButtonLink>
        <ButtonLink
          href="/hemen-basla"
          aria-current={pathname === "/hemen-basla" ? "page" : undefined}
        >
          Hemen Başla
        </ButtonLink>
      </div>
    </>
  );
}
