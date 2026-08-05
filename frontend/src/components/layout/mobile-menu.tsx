"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/ui/button";

const links = [
  { href: "/nasil-calisir", label: "Nasıl Çalışır" },
  { href: "/#ozellikler", label: "Özellikler" },
  { href: "/iletisim", label: "İletişim" },
];

export function MobileMenu() {
  const pathname = usePathname();
  const [menuState, setMenuState] = useState({ open: false, pathname });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const open = menuState.open && menuState.pathname === pathname;

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstLinkRef.current?.focus();

    const closeAndRestoreFocus = () => {
      setMenuState({ open: false, pathname });
      requestAnimationFrame(() => buttonRef.current?.focus());
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAndRestoreFocus();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        closeAndRestoreFocus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, pathname]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setMenuState({ open: !open, pathname })}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
        className="grid size-11 place-items-center rounded-lg border border-[var(--line)] focus-visible:outline-2 focus-visible:outline-[var(--green)]"
      >
        {open ? <X aria-hidden size={20} /> : <Menu aria-hidden size={20} />}
      </button>
      {open ? (
        <div
          ref={menuRef}
          id="mobile-navigation"
          className="absolute inset-x-0 top-full border-y border-[var(--line)] bg-[var(--cream)] p-5 shadow-lg"
        >
          <nav aria-label="Mobil navigasyon" className="flex flex-col gap-1">
            {links.map((link, index) => (
              <Link
                ref={index === 0 ? firstLinkRef : undefined}
                key={link.href}
                href={link.href}
                aria-current={
                  !link.href.includes("#") && pathname === link.href
                    ? "page"
                    : undefined
                }
                onClick={() => setMenuState({ open: false, pathname })}
                className="rounded-lg px-3 py-3 font-medium hover:bg-[var(--sage)]"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <ButtonLink
                href="/giris"
                variant="secondary"
                aria-current={pathname === "/giris" ? "page" : undefined}
                onClick={() => setMenuState({ open: false, pathname })}
              >
                Giriş Yap
              </ButtonLink>
              <ButtonLink
                href="/hemen-basla"
                aria-current={pathname === "/hemen-basla" ? "page" : undefined}
                onClick={() => setMenuState({ open: false, pathname })}
              >
                Hemen Başla
              </ButtonLink>
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
