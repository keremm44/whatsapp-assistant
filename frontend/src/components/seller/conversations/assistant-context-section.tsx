import { Sparkles } from "lucide-react";

import type { ConversationAiContext } from "@/lib/seller/conversations-server";

export function AssistantContextSection({
  context,
}: {
  context: ConversationAiContext;
}) {
  const usage = context.usage;
  return (
    <section className="space-y-2.5 px-5 py-5">
      <p className="flex items-center gap-1.5 type-meta font-semibold text-muted-foreground">
        <Sparkles aria-hidden="true" size={14} strokeWidth={1.75} />
        <span>Asistan özeti</span>
      </p>
      {context.summary ? (
        <p className="type-row-secondary text-foreground">{context.summary}</p>
      ) : (
        <p className="type-row-secondary text-muted-foreground">
          Henüz kullanılabilir bir konuşma özeti yok.
        </p>
      )}
      {context.memoryIncomplete ? (
        <p className="type-meta text-muted">
          Özet sınırlı geçmişten üretildi; kesin sipariş ve iade kayıtlarının yerine geçmez.
        </p>
      ) : (
        <p className="type-meta text-muted">
          Yardımcı bağlamdır; kesin sipariş ve iade kayıtlarının yerine geçmez.
        </p>
      )}
      {usage ? (
        <p className="type-meta text-muted-foreground">
          Son AI kullanımı: {usage.callCount} çağrı · {usage.totalTokens.toLocaleString("tr-TR")} token
          {usage.date ? ` · ${usage.date}` : ""}
        </p>
      ) : null}
    </section>
  );
}
