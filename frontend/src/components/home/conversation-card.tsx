import { ArrowDownRight } from "lucide-react";

export function ConversationCard() {
  return (
    <div className="relative mx-auto max-w-md rounded-[1.25rem] border border-[var(--line)] bg-[var(--paper)] p-4 shadow-[0_24px_60px_rgba(62,53,40,.12)] sm:p-6">
      <div className="mb-5 flex items-center gap-3 border-b border-[var(--line)] pb-4">
        <span className="grid size-9 place-items-center rounded-full bg-[var(--sage)] font-serif font-bold text-[var(--green)]">
          K
        </span>
        <div>
          <p className="text-sm font-semibold">Kupa siparişi</p>
          <p className="text-xs text-[var(--muted)]">Yeni mesaj</p>
        </div>
      </div>
      <div className="space-y-3 text-sm leading-6">
        <Bubble>Merhaba, kupaya iki farklı fotoğraf bastırabilir miyiz?</Bubble>
        <Bubble assistant>
          Elbette. Kupanın iki yüzüne farklı görsel uygulanabilir. Fotoğrafların
          net olması yeterli.
        </Bubble>
        <Bubble>Bugün göndersem cuma gününe yetişir mi?</Bubble>
        <Bubble assistant>
          Kesin teslim tarihi için mağaza sahibimiz kontrol etsin. Mesajınızı
          kendisine bırakıyorum.
        </Bubble>
      </div>
      <div className="mt-5 flex items-center gap-2 rounded-lg bg-[#fff1e8] px-3 py-2.5 text-xs font-semibold text-[#824833]">
        <ArrowDownRight aria-hidden size={16} /> Konuşma mağaza sahibine
        bırakıldı
      </div>
    </div>
  );
}

function Bubble({
  children,
  assistant = false,
}: {
  children: React.ReactNode;
  assistant?: boolean;
}) {
  return (
    <div
      className={`max-w-[88%] rounded-xl px-3.5 py-2.5 ${assistant ? "mr-auto bg-[var(--sage)]" : "ml-auto bg-[#eee9df]"}`}
    >
      <span className="mb-0.5 block text-[10px] font-bold tracking-wide text-[var(--muted)] uppercase">
        {assistant ? "Asistan" : "Müşteri"}
      </span>
      {children}
    </div>
  );
}
