import type { Route } from "next";
import Link from "next/link";
import { ArrowUpRight, MessageCircleQuestion } from "lucide-react";

import { KnowledgeWorkspace } from "@/components/seller/assistant-settings/knowledge-workspace";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";
import {
  KNOWLEDGE_GLOBAL_SCOPE_NOTE,
  KNOWLEDGE_PAGE_CAPTION,
  KNOWLEDGE_PAGE_DESCRIPTION,
  KNOWLEDGE_PAGE_TITLE,
  KNOWLEDGE_PRODUCTS_HREF,
  KNOWLEDGE_PRODUCTS_LINK_LABEL,
  KNOWLEDGE_SAVED_ANSWERS_DESCRIPTION,
  KNOWLEDGE_SAVED_ANSWERS_HREF,
  KNOWLEDGE_SAVED_ANSWERS_LINK_LABEL,
  KNOWLEDGE_SAVED_ANSWERS_TITLE,
  SETTINGS_BACK_HREF,
  SETTINGS_BACK_LABEL,
} from "@/lib/seller/assistant-settings-format";
import { resolveSellerSettingsFromSession } from "@/lib/seller/assistant-settings-server";

/**
 * Asistanın Bildikleri — seller-wide product / usage / shipping / return
 * information the assistant may tell customers.
 *
 * Server Component. Settings are loaded through GET /seller/settings.
 * Sparse/null values are a valid ready state, not an empty page.
 *
 * Two navigation-only companions frame the four editable sections:
 *   - the global-scope note (everything here is seller-wide; per-product
 *     configuration lives under Ürünler, with a real link);
 *   - the "Kayıtlı müşteri cevapları" pointer to the answered view of
 *     Cevaplanamayan Sorular. It duplicates nothing — the answers'
 *     single source of truth stays the unanswered workspace, and they
 *     are never merged into Kurallar.
 */
export default async function SellerAssistantKnowledgePage() {
  const bootstrap = await resolveSellerSettingsFromSession();

  return (
    <PageContainer className="py-8 sm:py-10">
      <div className="mb-4">
        <Link
          href={SETTINGS_BACK_HREF}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {SETTINGS_BACK_LABEL}
        </Link>
      </div>
      <PageHeader
        caption={KNOWLEDGE_PAGE_CAPTION}
        title={KNOWLEDGE_PAGE_TITLE}
        description={KNOWLEDGE_PAGE_DESCRIPTION}
      />

      {/* Seller-wide scope — must be unmistakable before any field. */}
      <p className="max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
        {KNOWLEDGE_GLOBAL_SCOPE_NOTE}{" "}
        <Link
          href={KNOWLEDGE_PRODUCTS_HREF as Route}
          className="inline-flex items-center gap-0.5 font-medium text-primary-text transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span>{KNOWLEDGE_PRODUCTS_LINK_LABEL}</span>
          <ArrowUpRight aria-hidden="true" size={13} strokeWidth={1.75} />
        </Link>
      </p>

      <div className="mt-6">
        <KnowledgeWorkspace bootstrap={bootstrap} />
      </div>

      {/* Kayıtlı müşteri cevapları — visibility/navigation only. */}
      <Surface as="section" className="mt-4 px-4 py-4 md:px-5">
        <div className="flex items-start gap-3">
          <MessageCircleQuestion
            aria-hidden="true"
            size={16}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-[13.5px] font-semibold text-foreground">
              {KNOWLEDGE_SAVED_ANSWERS_TITLE}
            </h2>
            <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {KNOWLEDGE_SAVED_ANSWERS_DESCRIPTION}
            </p>
            <Link
              href={KNOWLEDGE_SAVED_ANSWERS_HREF as Route}
              className="inline-flex min-h-11 items-center gap-1 rounded-sm text-[13px] font-medium text-primary-text transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:min-h-8"
            >
              <span>{KNOWLEDGE_SAVED_ANSWERS_LINK_LABEL}</span>
              <ArrowUpRight aria-hidden="true" size={13} strokeWidth={1.75} />
            </Link>
          </div>
        </div>
      </Surface>
    </PageContainer>
  );
}
