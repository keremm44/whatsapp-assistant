import Link from "next/link";

import { KnowledgeWorkspace } from "@/components/seller/assistant-settings/knowledge-workspace";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import {
  KNOWLEDGE_PAGE_CAPTION,
  KNOWLEDGE_PAGE_DESCRIPTION,
  KNOWLEDGE_PAGE_TITLE,
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
      <div className="mt-8">
        <KnowledgeWorkspace bootstrap={bootstrap} />
      </div>
    </PageContainer>
  );
}
